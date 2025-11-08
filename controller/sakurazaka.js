// sakurazaka.js
import fs from 'fs';
import {
    loadExistingBlogs,
    saveBlogsToFile,
    getHtmlDocument,
    parseDateTime,
    getElementInnerText,
    getBlogID,
    getJsonList,
    // Constants & config
    Sakurazaka46_BlogStatus_FilePath,
    Sakurazaka46_History_FilePath,
    Sakurazaka46_HomePage,
    DateFormats,
    IdolGroup,
    blogThread
} from '../global.js'; // Adjust the relative path to your global.js


const Sakurazaka46_Cookies = [
    { Name: "S5SI", Domain: ".sakurazaka46.com", Value: "78fo1tck89rj2djebtopi50e040v0ba8" },
    { Name: "key", Domain: ".sakurazaka46.com", Value: "true" },
    { Name: "_gid", Domain: ".sakurazaka46.com", Value: "GA1.2.2088122818.1750061010" },
    { Name: "_fbp", Domain: ".sakurazaka46.com", Value: "fb.1.1750061010749.11639999656523888" },
    { Name: "_tt_enable_cookie", Domain: ".sakurazaka46.com", Value: "1" },
    { Name: "_ttp", Domain: ".sakurazaka46.com", Value: "01JXVW7KTYA9156VFE35FEBGA2_.tt.1" },
    { Name: "WAPID", Domain: ".sakurazaka46.com", Value: "SsjVd8IcyXdl6jtZEmufBx3uHGshoRjHkbb" },
    { Name: "wap_last_event", Domain: ".sakurazaka46.com", Value: "showWidgetPage" },
    { Name: "wovn_selected_lang", Domain: ".sakurazaka46.com", Value: "ja" },
    { Name: "_gcl_au", Domain: ".sakurazaka46.com", Value: "1.1.1096332396.1750061010.635129526.1750061039.1750061040" },
    { Name: "B81AC560F83BFC8C", Domain: ".sakurazaka46.com", Value: "1e0075744ba0619c720ff2c7775e578b8794d4ae" },
    { Name: "_ga", Domain: ".sakurazaka46.com", Value: "GA1.1.845586032.1750061010" },
    { Name: "ttcsid", Domain: ".sakurazaka46.com", Value: "1750061010784::6PtzzxdhGjeyN1TyAoFh.1.1750061140610" },
    { Name: "ttcsid_CJRGJP3C77UDFRIURHQG", Domain: ".sakurazaka46.com", Value: "1750061010784::WFvu8TCrINLkj6YIlAMK.1.1750061140821" },
    { Name: "_ga_F26TDBWM4S", Domain: ".sakurazaka46.com", Value: "GS2.1.s1750061010$o1$g1$t1750061143$j57$l0$h0" }
]

const sakurazaka46_Members = {
    '四期生リレー': [
        "浅井恋乃未",
        "稲熊ひな",
        "勝又春",
        "佐藤愛桜",
        "中川智尋",
        "松本和子",
        "目黒陽色",
        "山川宇衣",
        "山田桃実"
    ]
};

// A container for the blog entries. In C#, this was a Dictionary<string, Blog>.


/**
 * Equivalent to: public static void Sakurazaka46_Crawler()
 */
export async function Sakurazaka46_Crawler() {
    // Load existing blogs from JSON
    const Blogs = await loadExistingBlogs(Sakurazaka46_BlogStatus_FilePath);
    const oldBlogsCount = Object.keys(Blogs).length;

    // Create an array of "thread IDs" from 0..(threadCount-1).
    // Run them all in parallel with Promise.all
    const tasks = [];
    for (let i = 0; i < blogThread; i++) {
        tasks.push(processPages(i, blogThread, Blogs));
    }
    await Promise.all(tasks);

    // Compare count before & after
    const newBlogsCount = Object.keys(Blogs).length;

    // If there are new blogs, save them
    if (newBlogsCount > oldBlogsCount)
        await saveBlogsToFile(
            Blogs,
            IdolGroup.Sakurazaka46, // "Sakurazaka46"
            Sakurazaka46_BlogStatus_FilePath,
            sakurazaka46_Members
        );
    //const result = JSON.stringify(Blogs, null, 2);
}

/**
 * Equivalent to: private static void ProcessPages(int threadId, int threadCount)
 * Loop through pages from threadId to 1000 in steps of threadCount
 */
async function processPages(threadId, threadCount, Blogs) {
    //console.log(`Thread ID [${threadId}] started processing.`);
    for (let currentPage = threadId; currentPage <= 1000; currentPage += threadCount) {
        try {
            //console.log(`threadId [${threadId}] Processing Page ${currentPage}`);
            const url = `${Sakurazaka46_HomePage}/s/s46/diary/blog/list?page=${currentPage}`;
            const htmlDoc = await getHtmlDocument(url);
            if (htmlDoc) {
                // First, gather all <li class="box"> (in the broad sense of “contains box class”)
                const allLiBox = htmlDoc.querySelectorAll('li.box');
                if (!allLiBox || allLiBox.length === 0) {
                    console.log(`Not found in Page ${currentPage}`);
                    break; // No more results
                }

                // Now filter so that ONLY <li class="box"> is included
                // (i.e., exclude <li class="box something-else">)
                const exactLiBox = allLiBox.filter(
                    node => node.getAttribute('class') === 'box'
                );
                if (exactLiBox.length === 0) {
                    console.log(`No exact <li class="box"> found on Page ${currentPage}`);
                    break;
                }

                for (const element of exactLiBox) {
                    // If processBlog returns false, stop reading more from this page
                    const shouldContinue = await processBlog(element, currentPage,Blogs);
                    if (!shouldContinue) {
                        //console.log(`Stopping further processing on Page ${currentPage}`);
                        return;
                    }
                }
            } else {
                console.log(`Not found in Page ${currentPage}`);
                break; // break out if no results on this page
            }
        } catch (ex) {
            console.log(`Error on Page ${currentPage}: ${ex.message}`);
            break;
        }
    }
    //console.log(`Thread ID [${threadId}] completed processing.`);
}

/**
 * Equivalent to: private static bool ProcessBlog(HtmlNode element, int currentPage)
 */
async function processBlog(element, currentPage,Blogs) {
    const startTime = Date.now();

    // The blog URL is from the first <a> child
    const aTag = element.querySelector("a");
    if (!aTag || !aTag.getAttribute("href")) {
        return false; // skip if no link is available
    }

    const hrefValue = aTag.getAttribute("href");
    const blogPath = `${Sakurazaka46_HomePage}${hrefValue}`;
    // Get member name from <p class="name"> element
    const blogMemberName = getElementInnerText(element, "p", "class", "name")
        .trim()
        .replace(/\s+/g, ""); // remove spaces

    const urlObj = new URL(blogPath);
    const blogID = getBlogID(urlObj.pathname);

    if (!Blogs[blogID]) {
        // This blog ID not yet in our dictionary
        const blogDoc = await getHtmlDocument(blogPath);
        if (
            blogDoc &&
            blogDoc.querySelector("div.box-article") &&
            blogDoc.querySelector("div.blog-foot")
        ) {
            const article = blogDoc.querySelector("div.box-article");
            const foot = blogDoc.querySelector("div.blog-foot");

            // Gather all <img src="...">
            const imageNodes = article.querySelectorAll("img");
            const imageList = imageNodes
                .map(img => img.getAttribute("src"))
                .filter(src => src);

            const blogDateTime = getElementInnerText(foot, "p", "class", "date wf-a");
            const blogTitle = getElementInnerText(element, "h3", "class", "title");

            // Save to our dictionary
            Blogs[blogID] = {
                ID: blogID,
                Name: blogMemberName,
                Title: blogTitle,
                DateTime: parseDateTime(blogDateTime, DateFormats[4]),
                ImageList: imageList,
                Content: article.innerHTML
            };

            const diff = (Date.now() - startTime) / 1000; // in seconds
            console.log(
                "\x1b[32m%s\x1b[0m",
                `Blog ID:[${blogID}][${blogMemberName}] ` +
                `Date:[${Blogs[blogID].DateTime.slice(0, 16).replace('T', ' ')}] ` +
                `ImgCount:[${imageList.length}] ` +
                `Page:[${currentPage}] ` +
                `ProcessingTime:[${diff.toFixed(3)}s]`
            );
            return true;
        } else {
            // Red text
            console.log(
                "\x1b[31m%s\x1b[0m",
                `Not found on Blog Id ${blogID} for Member ${blogMemberName}`
            );
            return false;
        }
    } else {
        // Yellow text
        //console.log("\x1b[33m%s\x1b[0m", `Duplicate Blog Id ${blogID} for Member ${blogMemberName} found on Page ${currentPage}`);
        return false;
    }
}

export async function Sakurazaka46_History_Crawler() {
    let history_photos_col = await getJsonList(Sakurazaka46_History_FilePath) ?? [];
    const indexs = history_photos_col.map(col => col.col_index);
    const max_col_index = Math.max(...indexs, 30);
    for (let col_index = 27; col_index <= max_col_index; col_index++) {
        try {
            if (history_photos_col.find(col => col.col_index == col_index)) {
                continue;
            }
            const code = `fc_photo_0${col_index}`
            const url = `${Sakurazaka46_HomePage}/s/s46/contents_list?cd=104&ct=${code}`;
            const htmlDoc = await getHtmlDocument(url, Sakurazaka46_Cookies);
            fs.writeFileSync(
                code + '.html',
                htmlDoc.innerHTML,
                'utf-8'
            );
            if (htmlDoc) {
                const content = htmlDoc.querySelector('div.sakura-history-detail-list')
                const header = htmlDoc.querySelector('div.headarea')
                const imageNodes = content.querySelectorAll('span.c-thumb-img');
                const intro = htmlDoc.querySelector('p.lead')?.innerText ?? "";
                const title = header?.innerText.trim() ?? "";;
                console.log({ intro, title, count: imageNodes.length })
                const col = {
                    col_index,
                    code,
                    title,
                    intro,
                    imageList: imageNodes.map((photo, photo_index) => ({
                        photo_index,
                        image_src: photo.getAttribute("data-download-image-path").replace('/750_750_102400', ''),
                        title: code + '.jpg'
                    })).filter(src => src.image_src)
                }
                console.log(col)
                history_photos_col.push(col)
            }
        } catch (ex) {
            console.log(`Error on Page ${col_index}: ${ex.message}`);
            break;
        }
    }

    fs.writeFileSync(
        Sakurazaka46_History_FilePath,
        JSON.stringify(history_photos_col, null, 2),
        'utf-8'
    );
    return history_photos_col;
}