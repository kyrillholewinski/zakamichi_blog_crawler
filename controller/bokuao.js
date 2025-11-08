// bokuao.js
import {
    loadExistingBlogs,
    saveBlogsToFile,
    getHtmlDocument,
    parseDateTime,
    getBlogID,
    getElementInnerText,
    // constants
    Bokuao_BlogStatus_FilePath,
    Bokuao_HomePage,
    DateFormats,
    IdolGroup,
    threadCount,
} from '../global.js'; // Adjust path to your global.js


// A dictionary of ID -> name, as in your C# code
const BokuaoMembers = {
    "10": "青木 宙帆", "11": "秋田 莉杏", "12": "安納 蒼衣",
    "13": "伊藤 ゆず", "14": "今井 優希", "15": "岩本 理瑚",
    "16": "金澤 亜美", "17": "木下 藍", "18": "工藤 唯愛",
    "19": "塩釜 菜那", "20": "杉浦 英恋", "21": "須永 心海",
    "22": "西森 杏弥", "23": "萩原 心花", "24": "長谷川 稀未",
    "25": "早﨑 すずき", "26": "宮腰 友里亜", "27": "持永 真奈",
    "28": "八重樫 美伊咲", "29": "八木 仁愛", "30": "柳堀 花怜",
    "31": "山口 結杏", "32": "吉本 此那"
};

// A subset you’re interested in, if needed
const DesiredBokuaoMembers = {
    "12": "安納 蒼衣", "16": "金澤 亜美",
    "22": "西森 杏弥", "24": "長谷川 稀未",
    "25": "早﨑 すずき", "26": "宮腰 友里亜"
};

// We store blogs in a plain JS object keyed by blog ID
let Blogs = {};

// This replicates your C# array of Cookie objects. We'll pass it
// as a "cookies" array to our getHtmlDocument (which in turn
// can set a "Cookie" header).
const BokuaoCookies = [
    {
        Name: "bokuao.com",
        Domain: "bokuao.com",
        Value: "eedd284297c9c9b766602c93867d67df885e483772394b83ca4ed8ac6af5a5f1"
    },
    {Name: "_ga", Domain: ".bokuao.com", Value: "GA1.1.1597477387.1689080792"},
    {Name: "_ga_REPH28T1S0", Domain: ".bokuao.com", Value: "GS1.1.1720706617.17.1.1720706833.0.0.0"},
    {Name: "PHPSESSID", Domain: "bokuao.com", Value: "1lg5idofatd9s720dp8ng4sal0"},
];

// We skip these images entirely
const ignoreImgs = [
    "/static/common/global-image/dummy.gif",
    "/static/ligareaz/official/common/cover_video.png",
    "/static/common/global-image/blank_thumb.gif"
];

/**
 * Equivalent to: public static void Bokuao_Crawler()
 */
export async function Bokuao_Crawler() {
    // 1) Load existing blogs from file
    Blogs = loadExistingBlogs(Bokuao_BlogStatus_FilePath);
    const oldBlogsCount = Object.keys(Blogs).length;

    // 2) Concurrency approach
    const tasks = [];
    for (let i = 0; i < threadCount; i++) {
        tasks.push(processPages(i, threadCount));
    }
    await Promise.all(tasks);

    // 3) If new blogs were added, save to file
    const newBlogsCount = Object.keys(Blogs).length;
    if (newBlogsCount > oldBlogsCount) {
        saveBlogsToFile(Blogs, IdolGroup.Bokuao, Bokuao_BlogStatus_FilePath);
    }

    const result = JSON.stringify(Blogs, null, 2);


    // 4) Clear the dictionary
    Blogs = {};

    return result;
}

/**
 * Equivalent to: private static void ProcessPages(int threadId, int threadCount)
 */
async function processPages(threadId, threadCount) {
    // Start from page = threadId+1 (like your C# code)
    // and go up to 1000 in increments of threadCount
    for (let currentPage = threadId + 1; currentPage <= 1000; currentPage += threadCount) {
        try {
            //console.log(`thread [${threadId}] Processing Page ${currentPage}`);
            const url = `${Bokuao_HomePage}/blog/list/1/0/?writer=0&page=${currentPage}`;

            const htmlDocument = await getHtmlDocument(url);
            if (
                htmlDocument &&
                htmlDocument.querySelectorAll("li[data-delighter]").length > 0
            ) {
                const nodeCollection = htmlDocument.querySelectorAll("li[data-delighter]");
                for (const element of nodeCollection) {
                    const shouldContinue = await processBlog(element, currentPage);
                    if (!shouldContinue) {
                        return;
                    }
                }
            } else {
                console.log(`Not found in Page ${currentPage}`);
                break;
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

    // The first <a> in this element
    const aTag = element.querySelector("a");
    if (!aTag || !aTag.getAttribute("href")) {
        return true; // skip if no link
    }

    const hrefValue = aTag.getAttribute("href");
    const blogPath = `${Bokuao_HomePage}${hrefValue}`;
    const blogMemberName = getElementInnerText(element, "p", "class", "writer")
        .trim()
        .replace(/\s+/g, ""); // remove spaces
    const blogID = getBlogID(new URL(blogPath).pathname);

    // Check if we already have this blog
    if (!Blogs[blogID]) {
        // Retrieve the blog detail page, with cookies
        const blogDoc = await getHtmlDocument(blogPath, BokuaoCookies);
        if (blogDoc) {
            const article = blogDoc.querySelector("div.txt");
            if (article) {
                // Gather images, ignoring the ones in ignoreImgs
                const imageList = article
                    .querySelectorAll("img")
                    .map(img => img.getAttribute("src"))
                    .filter(
                        src =>
                            src &&
                            !ignoreImgs.some(ignored => ignored === src)
                    );
                const blogDateTime = getElementInnerText(element, "time", "class", "date");
                const blogTitle = getElementInnerText(element, "p", "class", "tit");

                const blog = {
                    ID: blogID,
                    Name: blogMemberName,
                    Title: blogTitle,
                    DateTime: parseDateTime(blogDateTime, DateFormats[3]), // e.g. "yyyy.MM.dd"
                    ImageList: imageList
                };

                Blogs[blogID] = blog;
                const diff = ((Date.now() - startTime) / 1000).toFixed(3);
                console.log("\x1b[32m%s\x1b[0m",
                    `Blog ID:[${blog.ID}][${blog.Name}]` +
                    `Date:[${blog.DateTime.slice(0, 16).replace('T', ' ')}]` +
                    `ImgCount:[${blog.ImageList.length}]` +
                    `Page:[${currentPage}]` +
                    `ProcessingTime:[${diff}s]`
                );
            } else {
                // Red color
                console.log("\x1b[31m%s\x1b[0m", `Not found on Blog Id ${blogID} for Member ${blogMemberName}`);
                return false;
            }
        }
        return true;
    } else {
        // Yellow color
        //console.log("\x1b[33m%s\x1b[0m",`Duplicate Blog Id ${blogID} for Member ${blogMemberName} found on Page ${currentPage}`);
        return false;
    }
}
