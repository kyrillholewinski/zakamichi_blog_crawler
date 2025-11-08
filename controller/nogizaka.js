// nogizaka.js
import fs from 'fs';
import {
    DateFormats,
    getHttpResponse,
    getJsonList, Hinatazaka46_BlogStatus_FilePath,
    IdolGroup,
    Nogizaka46_BlogStatus_FilePath,
    parseDateTime, saveBlogsToFile,
    threadCount,
} from '../global.js'; // adjust path to wherever your global.js is located
// If using node-html-parser or similar to parse HTML:
import { parse as parseHtml } from 'node-html-parser';

////////////////////////////////////////////////////////////////////////////////
// Global data structure
////////////////////////////////////////////////////////////////////////////////

let Nogizaka46_Blogs = {}; // Replaces static Dictionary<string, Blog> in C#

// Mapping of generation -> list of member names
// Use exactly as you have them in C# or store them in a separate config.
const Nogizaka46_Members = {
    '３期生': ['伊藤理々杏', '岩本蓮加', '梅澤美波', '大園桃子', '久保史緒里', '阪口珠美', '佐藤楓', '中村麗乃', '向井葉月', '山下美月', '吉田綾乃クリスティー', '与田祐希'],
    '４期生': ['遠藤さくら', '賀喜遥香', '掛橋沙耶香', '金川紗耶', '北川悠理', '柴田柚菜', '清宮レイ', '田村真佑', '筒井あやめ', '早川聖来', '矢久保美緒'],
    '新4期生': ['黒見明香', '佐藤璃果', '林瑠奈', '松尾美佑', '弓木奈於'],
    '5期生': ['五百城茉央', '池田瑛紗', '一ノ瀬美空', '井上和', '岡本姫奈', '小川彩', '奥田いろは', '川﨑桜', '菅原咲月', '冨里奈央', '中西アルノ'],
    '6期生リレー': ['愛宕心響', '大越ひなの', '小津玲奈', '海邉朱莉', '川端晃菜', '鈴木佑捺', '瀬戸口心月', '長嶋凛桜', '増田三莉音', '森平麗心', '矢田萌華']
};

// This is equivalent to `private static readonly int blogPerThread = 128;`
const blogPerThread = 128;

////////////////////////////////////////////////////////////////////////////////
// Functions
////////////////////////////////////////////////////////////////////////////////

/**
 * Equivalent to:
 *   public static Nogizaka46_BlogList GetNogizakaBlogList(string uri)
 *
 * In your .NET code, you do a GET request, slice the returned JSON,
 * and parse it with `JsonSerializer.Deserialize<Nogizaka46_BlogList>`.
 *
 * We'll do the same in Node, returning an object shaped like:
 *   { count: string, data: Nogizaka46_BlogData[] }
 */
async function getNogizakaBlogList(uri) {
    try {
        const response = await getHttpResponse(uri, 'GET'); // from global.js
        if (response.status === 200) {
            // "responseString" is the response body
            const responseString = response.data;
            // If responseString is e.g. "res({ count: "...", data: ... })", we slice off "res(" at front
            // and ");" at the end
            if (responseString) {
                // Equivalent to string json = responseString[4..^2];
                const json = responseString.slice(4, -2);
                const obj = JSON.parse(json); // parse with standard JSON
                return obj || { count: "0", data: [] };
            }
        }
    } catch (err) {
        console.error("Error in getNogizakaBlogList:", err.message);
    }
    // Return empty if anything fails
    return { count: "0", data: [] };
}



/**
 * Equivalent to: private static bool GetBlogsInfo(int threadId)
 */
async function getBlogsInfo(threadId) {
    // e.g. https://www.nogizaka46.com/s/n46/api/list/blog?rw=128&st=0&callback=res
    const uri = `https://www.nogizaka46.com/s/n46/api/list/blog?rw=${blogPerThread}&st=${threadId * blogPerThread}&callback=res`;

    const blogList = await getNogizakaBlogList(uri);
    if (!blogList || !blogList.data) {
        console.log("end");
        return false;
    }

    for (const blogData of blogList.data) {
        const start = Date.now();
        // parse the blogData.text as HTML
        const htmlDocument = parseHtml(blogData.text);

        // Construct a Blog object
        const blog = {
            ID: blogData.code,
            Title: blogData.title,
            Name: blogData.name.replace(/\s+/g, ''), // remove spaces
            DateTime: parseDateTime(blogData.date, DateFormats[2], true), // "yyyy/MM/dd HH:mm:ss", Japan time
            ImageList: htmlDocument
                .querySelectorAll("img")
                .map(e => e.getAttribute("src"))
                .filter(Boolean),
            Content: blogData.text
        };

        // Replace "TryAdd" logic
        // If blog ID doesn't exist in Nogizaka46_Blogs, add it.
        if (!(blog.ID in Nogizaka46_Blogs)) {
            Nogizaka46_Blogs[blog.ID] = blog;
            const diff = (Date.now() - start) / 1000;
            console.log("\x1b[32m%s\x1b[0m", `Blog ID:[${blog.ID}][${blog.Name}]` + `Date:[${blog.DateTime}] ` + `ImgCount:[${blog.ImageList.length}]` + `Page:[${threadId}]` + `ProcessingTime:[${diff.toFixed(3)}s]`);
        } else {
            // Found a duplicate
            //console.log(`Duplicate Blog Id ${blog.ID} for Member ${blog.Name} found on Page ${threadId}`);
            return false;
        }
    }
    return true;
}

/**
 * Equivalent to: public static void Nogizaka46_Crawler()
 */
export async function Nogizaka46_Crawler() {
    // 1) Load existing blogs from file, put them into a dictionary
    const existingMembers = getJsonList(Nogizaka46_BlogStatus_FilePath);

    // Flatten out all their BlogList items into an object
    Nogizaka46_Blogs = {};
    for (const member of existingMembers) {
        for (const b of member.BlogList) {
            Nogizaka46_Blogs[b.ID] = b;
        }
    }

    const oldBlogsCount = Object.keys(Nogizaka46_Blogs).length;
    console.log(`Nogizaka46_Blogs:${oldBlogsCount}`)

    // 2) Loop from threadId=0 to threadId=threadCount-1
    //    In your code, you used: int threadNumber = Environment.ProcessorCount;
    //    We'll do the same with threadCount from global.js
    for (let threadId = 0; threadId < threadCount; threadId++) {
        const keepLoop = await getBlogsInfo(threadId);
        if (!keepLoop) {
            break;
        }
    }

    // 3) Sort all blogs by DateTime ascending
    //    Then convert back to a dictionary keyed by blog ID
    const sortedEntries = Object.entries(Nogizaka46_Blogs).sort((a, b) => a[1].DateTime - b[1].DateTime);
    // Rebuild an object in sorted order
    Nogizaka46_Blogs = {};
    for (const [k, v] of sortedEntries) {
        Nogizaka46_Blogs[k] = v;
    }

    // Compare the new count with the old
    const newBlogsCount = Object.keys(Nogizaka46_Blogs).length;

    // If there are new blogs, save them to file
    if (newBlogsCount > oldBlogsCount)
        saveBlogsToFile(
            Nogizaka46_Blogs,
            IdolGroup.Nogizaka46,
            Nogizaka46_BlogStatus_FilePath,
            Nogizaka46_Members
        );

    // // 4) Build new "Member" objects from sorted blogs
    // const newNogizaka46Members = getGroupedMembers();

    // 5) Write them out to file
    // const jsonString = JSON.stringify(newNogizaka46Members, null, 2);
    // fs.writeFileSync(Nogizaka46_BlogStatus_FilePath, jsonString, 'utf-8');
    const jsonString = JSON.stringify(Nogizaka46_Blogs, null, 2);
    Nogizaka46_Blogs = {};
    return jsonString;
}

/**
 * Equivalent to: public static List<Member> GetGroupedMembers()
 *
 *   "We group blogs by blog.Name,
 *    then if group.Key is found in Nogizaka46_Members dictionary,
 *    we do blog.Name = selectedKiMemberNames[index % selectedKiMemberNames.Count]."
 */
export function getGroupedMembers() {
    // Convert the Blogs object into an array, grouped by blog.Name
    const allBlogs = Object.values(Nogizaka46_Blogs); // array of Blog
    // Group by blog.Name
    const groupedByName = {};
    for (const b of allBlogs) {
        if (!groupedByName[b.Name]) {
            groupedByName[b.Name] = [];
        }
        groupedByName[b.Name].push(b);
    }

    return Object.keys(groupedByName).map(groupName => {
        // group is array of Blog objects
        const group = groupedByName[groupName];

        // Build a Member
        const member = {
            Name: groupName,
            Group: IdolGroup.Nogizaka46,  // "Nogizaka46"
            BlogList: [...group]
        };

        // If groupName is found in Nogizaka46_Members,
        // we override each blog's Name property in a round-robin fashion
        // if (Nogizaka46_Members[grveroupName]) {
        //     const selectedKiMemberNames = Nogizaka46_Members[groupName];
        //     member.BlogList = group.map((blog, index) => {
        //         return {
        //             ...blog, Name: selectedKiMemberNames[index % selectedKiMemberNames.length],
        //         };
        //     });
        // }

        return member;
    });
}
