// Keyakizaka.js
import fs from 'fs';
import {
    loadExistingBlogs,
    saveBlogsToFile,
    getHtmlDocument,
    parseDateTime,
    getElementInnerText,
    getBlogID,
    getJsonList,

    // Constants from global.js
    Keyakizaka46_BlogStatus_FilePath,
    Keyakizaka46_HomePage,
    DateFormats,
    IdolGroup,
    threadCount,
    getJson,
} from '../global.js'; // <-- Adjust path to your global.js

// This object holds your blog entries, keyed by blog ID
let Blogs = {};


/**
 * Equivalent to: public static void Keyakizaka46_Crawler()
 */
export async function Keyakizaka46_Crawler() {
    // Load existing blogs from file
    Blogs = loadExistingBlogs(Keyakizaka46_BlogStatus_FilePath);
    const oldBlogsCount = Object.keys(Blogs).length;

    // Create an array of tasks for each “thread ID” from 0..threadCount-1
    const tasks = [];
    for (let i = 0; i < threadCount; i++) {
        tasks.push(processPages(i, threadCount));
    }
    // Run them all concurrently
    await Promise.all(tasks);

    // Compare the new count with the old
    const newBlogsCount = Object.keys(Blogs).length;

    if (newBlogsCount > oldBlogsCount) {
        // If there are new blogs, save them to file
        saveBlogsToFile(Blogs, IdolGroup.Keyakizaka46, Keyakizaka46_BlogStatus_FilePath);
    }

    const result = JSON.stringify(Blogs, null, 2);

    // Clear out the dictionary
    Blogs = {};

    return result;
}




/**
 * Equivalent to: private static void ProcessPages(int threadId, int threadCount)
 */
async function processPages(threadId, threadCount) {
    for (let currentPage = threadId; currentPage <= 1000; currentPage += threadCount) {
        try {
            //console.log(`threadId [${threadId}] Processing Page ${currentPage}`);
            const url = `${Keyakizaka46_HomePage}/s/k46o/diary/member/list?page=${currentPage}`;

            const htmlDoc = await getHtmlDocument(url);
            if (
                htmlDoc &&
                htmlDoc.querySelectorAll("article").length > 0
            ) {
                // For each .p-blog-article inside .p-blog-group
                const articleNodes = htmlDoc.querySelectorAll("article");
                for (const element of articleNodes) {
                    // If processBlog returns false, we stop processing further on this page
                    const shouldContinue = await processBlog(element, currentPage);
                    if (!shouldContinue) {
                        return;
                    }
                }
            } else {
                console.log(`Not found in Page ${currentPage}`);
                break; // No more pages to process if not found
            }
        } catch (ex) {
            console.log(`Error on Page ${currentPage}: ${ex.message}`);
            break;
        }
    }
}

/**
 * Equivalent to: private static bool ProcessBlog(HtmlNode element, int currentPage)
 */
async function processBlog(element, currentPage) {
    const startTime = Date.now();

    // Construct the full blog path by looking for <a class="c-button-blog-detail">
    const linkTag = element.querySelector("a");
    const linkHref = linkTag ? linkTag.getAttribute("href") : "/00000";
    const blogPath = `${Keyakizaka46_HomePage}${linkHref}`;

    // Get blog’s member name from <div class="c-blog-article__name">
    const blogMemberName = getElementInnerText(element, "p", "class", "name")
        .trim()
        .replace(/\s+/g, "");

    // Convert that path to an ID, e.g., /s/official/diary/xxxxx -> "xxxxx"
    const urlObj = new URL(blogPath);
    const blogID = getBlogID(urlObj.pathname);

    // Only proceed if this blog ID isn’t already in the dictionary
    if (!Blogs[blogID]) {
        // Title & Date from the same element
        const blogTitle = element.querySelector("div.box-ttl").querySelector("a").innerText;

        const boxBottom = element.querySelector("div.box-bottom").querySelectorAll("li");
        const blogDateTime = boxBottom.length > 0 ? boxBottom[0].innerText : "2020/01/01 00:00";
        // The blog text area to find images
        const blogInnerTextNode = element.querySelector("div.box-article");

        // Gather <img src="..."> from the text area
        let imageList = blogInnerTextNode
            ? blogInnerTextNode
                .querySelectorAll("img")
                .map((img) => img.getAttribute("src"))
                .filter((src) => src)
            : [];

        // If we suspect too many images, refetch from the blog page directly
        if (imageList.length > 10) {
            console.log("\x1b[33m%s\x1b[0m", "Warning! Too many images.");
            const fullDoc = await getHtmlDocument(blogPath);
            const fullTextNode = fullDoc
                ? fullDoc.querySelector("div.box-article")
                : null;
            if (fullTextNode) {
                imageList = fullTextNode
                    .querySelectorAll("img")
                    .map((img) => img.getAttribute("src"))
                    .filter((src) => src);
            }
        }

        // Construct the Blog object
        const blogObj = {
            ID: blogID,
            Name: blogMemberName,
            Title: blogTitle,
            DateTime: parseDateTime(blogDateTime, DateFormats[4], true), // japanTime: true
            ImageList: imageList,
        };

        Blogs[blogID] = blogObj;

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(3);
        console.log(
            "\x1b[32m%s\x1b[0m",
            `Blog ID:[${blogID}][${blogMemberName}] ` +
            `Date:[${blogObj.DateTime.slice(0, 16).replace('T', ' ')}] ` +
            `ImgCount:[${imageList.length}] ` +
            `Page:[${currentPage}] ` +
            `ProcessingTime:[${elapsedSec}s]`
        );
        return true;
    } else {
        // If blog already known, skip
        //console.log("\x1b[33m%s\x1b[0m",`Duplicate Blog Id ${blogID} for Member ${blogMemberName} found on Page ${currentPage}`);
        return false;
    }
}
