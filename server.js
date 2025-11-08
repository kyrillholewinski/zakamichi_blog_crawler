import express from 'express'
import archiver from 'archiver'
import os from 'os';
import {
    Hinatazaka46_BlogStatus_FilePath,
    Sakurazaka46_BlogStatus_FilePath,
    Keyakizaka46_BlogStatus_FilePath,
    Nogizaka46_BlogStatus_FilePath,
    Hinatazaka46_History_FilePath,
    Bokuao_BlogStatus_FilePath,
    formatYYYYMMDD,
    formatBytes,
    appendBlogImagesToArchive,
    parseDateTime,
    loadDesiredMemberList,
    addDesiredMember,
    removeDesiredMember,
    HistoryImagesToArchive,
    getJsonList,
    getHomePageByGroup,// or any other needed method
    // Possibly your function that returns the entire members list:
    // If you have "getFullMemberList()" in program.js, bring it in or re-implement here.
} from './global.js'; // or wherever your global methods are

// If you keep your "controller" modules in a folder "controller", import them:
import { Hinatazaka46_Crawler, Hinatazaka46_History_Crawler } from './controller/hinatazaka.js';
import { Keyakizaka46_Crawler } from './controller/keyakizaka.js';
import { Sakurazaka46_Crawler, Sakurazaka46_History_Crawler } from './controller/sakurazaka.js';
import { Nogizaka46_Crawler } from './controller/nogizaka.js';
import { Bokuao_Crawler } from './controller/bokuao.js';


const app = express()
app.use(express.json());
const interfaces = os.networkInterfaces();
const port = 5016

// Helper to run all crawlers in parallel
async function crawlAll() {
    await Promise.all([
        Hinatazaka46_Crawler(),
        Sakurazaka46_Crawler(),
        Nogizaka46_Crawler(),
        Bokuao_Crawler(),
    ]);
}

// Helper to get every member from every group
function getFullMemberList() {
    return [
        ...getJsonList(Hinatazaka46_BlogStatus_FilePath),
        ...getJsonList(Sakurazaka46_BlogStatus_FilePath),
        ...getJsonList(Nogizaka46_BlogStatus_FilePath),
        ...getJsonList(Keyakizaka46_BlogStatus_FilePath),
        ...getJsonList(Bokuao_BlogStatus_FilePath),
    ];
}

function getWebsite(body) {
    return `
        <html>
        <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100..900&display=swap" rel="stylesheet">
        <meta charset="utf-8">
        <title>Export API</title>
        <style>
            body { font-family: "Noto Sans JP", sans-serif; padding:2rem; }
            table { border-collapse:collapse; width:100%; margin-top:1rem; }
            th,td { border:1px solid #ccc; padding:.5rem; text-align:left; }
            th { background:#f5f5f5; }
            a { color:#0066cc; text-decoration:none; margin-left:.5rem; }
            a:hover { text-decoration:underline; }
            img { width: 50%; height: auto; max-width: 50%; }
        </style>
        </head>
        <body>
        ${body}
        </body>
        </html>
        `
}

app.get('/keyaki', async (_, res) => {
    await Keyakizaka46_Crawler();
    res.redirect('/')
})

app.get('/', (_, res) => {
    const members = getFullMemberList();
    const desiredNames = loadDesiredMemberList();

    // group by `Group`
    const grouped = members.reduce((acc, m) => {
        const g = m.Group || 'Ungrouped';
        (acc[g] = acc[g] || []).push(m);
        return acc;
    }, {});
    const groupNames = Object.keys(grouped);
    const maxRows = Math.max(...groupNames.map(g => grouped[g].length));

    // last 7 days links
    const dates = Array.from({ length: 7 }, (_, i) =>
        new Date(Date.now() - i * 86400e3)
    );
    const dateLinks = dates
        .map(d => {
            const ymd = formatYYYYMMDD(d);
            return `<a href="/export?date=${ymd}">${ymd}</a>`;
        })
        .join(' ');

    // table headers & rows
    const headers = groupNames.map(g => `<th>${g}</th>`).join('');
    const rows = Array.from({ length: maxRows }, (_, i) =>
        `<tr>
            ${groupNames.map(g => {
            const m = grouped[g][i];
            if (!m) return `<td></td>`;
            const blogCount = m.BlogList.length;
            const imageCount = m.BlogList.flatMap(blog => blog.ImageList).length;
            const isDesired = desiredNames.includes(m.Name);
            const mark = isDesired ? '✔️' : '❌';
            const mg = `member=${m.Name}&group=${m.Group}`;
            const action = isDesired ? 'remove' : 'add';
            const actionLabel = isDesired ? 'Remove' : 'Add';
            const tdContent =
                `
                                    <td>
                                    <a href="/members/${action}?${mg}">${mark} ${m.Name}</a>
                                    Blogs:<a href="/members/blogs?${mg}">${blogCount}</a>
                                    Images:<a href="/export?${mg}">${imageCount}</a> 
                                    </td>
                                `;
            return tdContent
        }).join('')}</tr>`
    ).join('');


    const bodyContent =
        `
                        <h1>Export API Links</h1>
                        <p>
                        <strong>Since:</strong>
                        <a href="/export">default (7 days ago)</a>
                        ${dateLinks}
                        </p>
                        <p>
                        <strong><a href="/history/list">History</a></strong>
                        <strong><a href="/refresh">Refresh</a></strong>
                        </p>                   
                        <h2>Members by Group</h2>
                        <table>
                        <thead><tr>${headers}</tr></thead>
                        <tbody>${rows}</tbody>
                        </table>
                        `;
    const html = getWebsite(bodyContent);

    res.send(html);
});

app.get('/refresh', async (_, res) => {
    await crawlAll();
    res.redirect('/')
})

// Single unified export endpoint
app.get('/export', async (req, res) => {
    try {
        const { member, group, date, blogId } = req.query;
        // 1) determine cutoff date
        const defaultDate = new Date(Date.now() - 7 * 24 * 3600 * 1000);
        let lastUpdate = defaultDate;
        if (date) {
            const parsed = new Date(parseDateTime(date, 'yyyyMMdd'));
            if (!isNaN(parsed)) lastUpdate = parsed;
        }

        const cutoffDate = member ? null : lastUpdate

        // 2) refresh all blogs
        await crawlAll();

        // 3) pick members to export
        const allMembers = getFullMemberList();
        const desired = loadDesiredMemberList();

        // if ?member=Name, only that one; otherwise all desired
        const memberBlogsToExport = member
            ? allMembers.filter(m => m.Name === member && m.Group === group)
            : allMembers.filter(m => desired.includes(m.Name));

        const blogsToExport = blogId 
        ? memberBlogsToExport.map(m => ({ Group: m.Group, Name: m.Name, BlogList: m.BlogList.filter(b => b.ID === blogId) })) 
        : memberBlogsToExport

        console.log(blogsToExport)

        if (!blogsToExport.length) {
            return res.status(404).json({ error: 'No matching members found' });
        }

        // 4) stream zip
        const archive = archiver('zip', { zlib: { level: 9 } });
        res.attachment('exported_images.zip');
        archive.pipe(res);

        // 5) for each member, append their images
        const archiveEntries = await Promise.all(
            blogsToExport.map(m => appendBlogImagesToArchive(m, cutoffDate))
        );

        archiveEntries.flat().forEach(({ data, name, date }) => {
            archive.append(data, { name, date });
        });

        // 6) finalize
        await archive.finalize();
        console.log('[EXPORT]', {
            ...req.query,
            fileCount: archiveEntries.flat().length,
            fileSize: formatBytes(archiveEntries.flat().reduce((partialSum, a) => partialSum + a.data.length, 0)),
            cutoffDate: cutoffDate?.toLocaleString("zh-TW", { timeZone: 'ROC' })
        });

    } catch (err) {
        console.error('❌ [EXPORT] error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Member Blogs List
app.get('/members/blogs', (req, res) => {
    const { member, group } = req.query;
    const selected = getFullMemberList().find(m => m.Name === member && m.Group === group);
    if (!selected) return res.send(getWebsite('<p>Member not found</p>'));

    const rows = selected.BlogList
        .sort((a, b) => b.ID - a.ID)
        .map(blog => `
                        <tr>
                            <td colspan="3">
                                <a href="/members/blog?member=${member}&group=${group}&blogId=${blog.ID}">
                                    ${blog.Title || "No title"}
                                </a>
                            </td>
                            <td>${blog.Name}</td>
                            <td>${new Date(blog.DateTime).toLocaleString("zh-TW", { timeZone: 'ROC' })}</td>
                            <td>
                                <a href="/export?member=${member}&group=${group}&blogId=${blog.ID}">
                                    Download
                                </a>
                            </td>
                        </tr>`
        ).join('');

    const htmlbody = `
                    <a href="/">← Back</a>
                    <h2>${selected.Name} (${selected.Group})</h2>
                    <table>
                        <thead>
                            <tr>
                                <th colspan="3">Blog Title</th>
                                <th>Series</th>
                                <th>Date & Time</th>
                                <th>Download</th>                       
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                    `

    res.send(getWebsite(htmlbody));
});

// Single Blog
app.get('/members/blog', (req, res) => {
    const { member, group, blogId } = req.query;
    const selected = getFullMemberList().find(m => m.Name === member && m.Group === group);
    const blogIndex = selected?.BlogList.findIndex(b => b.ID == blogId);
    const blog = selected?.BlogList[blogIndex];

    if (!selected || !blog) return res.send(getWebsite('<a href="/">← Back</a><p>Blog not found</p>'));

    const previousBlog = selected?.BlogList[blogIndex - 1];
    const nextBlog = selected?.BlogList[blogIndex + 1];

    const images = blog.ImageList.map(img =>
        `<img src="${getHomePageByGroup(selected.Group) + img}" alt="Blog Image">`
    ).join('');

    const prevnext =
        "<p>" +
        (previousBlog ? `<strong><a href="/members/blog?member=${member}&group=${group}&blogId=${previousBlog.ID}"><=Previous</a></strong>` : "") +
        (nextBlog ? `<strong><a href="/members/blog?member=${member}&group=${group}&blogId=${nextBlog.ID}">Next=></a></strong>` : "") +
        "</p> "


    const htmlbody = `
                    <a href="/members/blogs?member=${member}&group=${group}">← Back</a>
                    ${prevnext}
                    <h1>${blog.Title || "No title"}</h1>
                    <h3>By ${blog.Name} | ${new Date(blog.DateTime).toLocaleString("zh-TW", { timeZone: 'ROC' })}</h3>
                    <h4>Images:</h4>
                    ${images}
                    `
    res.send(getWebsite(htmlbody));
});

// Just an example: "Add desired member" as an API
app.get('/members/add', (req, res) => {
    const { member } = req.query;
    if (!member) {
        return res.status(400).json({ error: 'member is required' });
    }
    const success = addDesiredMember(member);
    if (success) {
        res.redirect('/');
    } else {
        return res.status(500).json({ error: 'Unable to add member' });
    }
});

// Just an example: "Add desired member" as an API
app.get('/members/remove', (req, res) => {
    const { member } = req.query;
    if (member) {
        const success = removeDesiredMember(member);
        if (success) {
            res.redirect('/');
        } else {
            return res.status(500).json({ error: 'Unable to remove member' });
        }
    } else {
        return res.status(400).json({ error: 'member is required' });
    }
});

app.get('/history/refresh', async (req, res) => {
    //await Hinatazaka46_History_Crawler();
    await Sakurazaka46_History_Crawler();
    res.redirect('/history/list')
})

app.get('/history/export', async (req, res) => {
    const { code } = req.query;
    const history_photos_col = getJsonList(Hinatazaka46_History_FilePath);

    const toExport = code ? history_photos_col.filter(col => col.code == code) : history_photos_col;
    if (!toExport) {
        res.send(`Not Found`)
    }
    // 4) stream zip
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment('exported_images.zip');
    archive.pipe(res);

    // 5) for each member, append their images
    const archiveEntries = await HistoryImagesToArchive(toExport)

    archiveEntries.forEach(({ data, name, date }) => {
        archive.append(data, { name, date });
    });

    // 6) finalize
    await archive.finalize();
    console.log('[EXPORT]', {
        ...req.query,
        fileCount: archiveEntries.length,
        fileSize: formatBytes(archiveEntries.reduce((partialSum, a) => partialSum + a.data.length, 0)),
    });
});

app.get('/history/list', (req, res) => {
    const history_photos_col = getJsonList(Hinatazaka46_History_FilePath)
    const rows = history_photos_col
        .sort((a, b) => b.col_index - a.col_index)
        .map(col => `
                        <tr>
                            <td colspan="3">
                                <a href="/history/col?code=${col.code}">
                                    ${col.title || "No title"}
                                </a>
                            </td>
                            <td>${col.code}</td>
                            <td>
                                <a href="/history/export?code=${col.code}">
                                   Download
                                </a>
                            </td>
                        </tr>`
        ).join('');

    const htmlbody = `
                    <a href="/">← Back</a>
                    <h2>Hinatazaka Collections</h2>
                    <h2><a href="/history/refresh"> Refresh</a></h2>
                    <table>
                        <thead>
                            <tr>
                                <th colspan="3">Collections Title</th>
                                <th>Code</th>
                                <th>Download</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                    `
    res.send(getWebsite(htmlbody));
});

app.get('/history/col', (req, res) => {
    const { code } = req.query;
    const history_photos_col = getJsonList(Hinatazaka46_History_FilePath)
    const col = history_photos_col.find(col => col.code === code);

    if (!col) return res.send(getWebsite('<a href="/">← Back</a><p>Blog not found</p>'));

    const images = col.imageList.map(img =>
        `<img src="${img.image_src}" alt="${img.title}">`
    ).join('');

    const htmlbody = `
                    <a href="/history/list">← Back</a>
                    <h1>${col.title || "No title"}</h1>
                    <h3>
                        <a href="/history/export?code=${col.code}">
                            Download
                        </a>
                    </h3>
                    <h4>Images:</h4>
                    ${images}
                    `
    res.send(getWebsite(htmlbody));
});


// Loop through each interface and its addresses
app.listen(port, () => {
    console.log('Server will listen on these IP addresses:');
    Object.keys(interfaces).forEach((ifaceName) => {
        interfaces[ifaceName].forEach((iface) => {
            // Only consider IPv4 addresses that are not internal (i.e. not 127.0.0.1)
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`${ifaceName}: http://${iface.address}:${port}`);
            }
        });
    });
});


