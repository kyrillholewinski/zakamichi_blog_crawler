import express from 'express'
import archiver from 'archiver'
import os from 'os';
import {
    Hinatazaka46_BlogStatus_FilePath,
    Sakurazaka46_BlogStatus_FilePath,
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
import { Hinatazaka46_Blog_Crawler, Hinatazaka46_History_Crawler } from './controller/hinatazaka.js';
import { Keyakizaka46_Crawler } from './controller/keyakizaka.js';
import { Sakurazaka46_Blog_Crawler, Sakurazaka46_History_Crawler } from './controller/sakurazaka.js';
import { Nogizaka46_Blog_Crawler } from './controller/nogizaka.js';
import { Bokuao_Blog_Crawler } from './controller/bokuao.js';


const app = express()
app.use(express.json());
const interfaces = os.networkInterfaces();
const port = 5016

// Helper to run all crawlers in parallel
async function crawlAll() {
    await Promise.all([
        Hinatazaka46_Blog_Crawler(),
        Sakurazaka46_Blog_Crawler(),
        Nogizaka46_Blog_Crawler(),
        Bokuao_Blog_Crawler(),
    ]);
}

// Helper to get every member from every group
async function getFullMemberList() {
    const Hinatazaka46_Blogs = await getJsonList(Hinatazaka46_BlogStatus_FilePath);
    const Sakurazaka46_Blogs = await getJsonList(Sakurazaka46_BlogStatus_FilePath);
    const Nogizaka46_Blogs = await getJsonList(Nogizaka46_BlogStatus_FilePath);
    const Bokuao_Blogs = await getJsonList(Bokuao_BlogStatus_FilePath);
    return [
        ...Hinatazaka46_Blogs,
        ...Sakurazaka46_Blogs,
        ...Nogizaka46_Blogs,
        ...Bokuao_Blogs,
    ];
}

const POLLING_INTERVAL_MS = parseInt('900', 10) * 1000;

// Function to process the blog data
const processBlogData = (data, year, month) => {
    const memberStats = {};
    const daysInMonth = new Date(year, month, 0).getDate();
    const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    data.forEach(member => {
        memberStats[member.Name] = Array(daysInMonth).fill(0);
        member.BlogList.forEach(blog => {
            const blogDate = new Date(blog.DateTime);
            if (blogDate.getFullYear() === year && blogDate.getMonth() + 1 === month) {
                const dayOfMonth = blogDate.getDate();
                memberStats[member.Name][dayOfMonth - 1]++;
            }
        });
    });

    const datasets = Object.keys(memberStats).map(name => {
        const color = `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.7)`;
        return {
            label: name,
            data: memberStats[name],
            backgroundColor: color,
            borderColor: color,
            borderWidth: 1,
            fill: false
        };
    });

    return {
        labels: labels.map(day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`),
        datasets: datasets
    };
};

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

app.get('/blogChart', async (req, res) => {
    // Default to a specific month/year if not provided, e.g., November 2015 from your data
    const year = parseInt(req.query.year, 10) || 2025;
    const month = parseInt(req.query.month, 10) || 10;

    const Sakurazaka46_Blogs = await getJsonList(Sakurazaka46_BlogStatus_FilePath);

    const chartData = processBlogData(Sakurazaka46_Blogs, year, month);

    const html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Keyakizaka46 Blog Stats</title>
                    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <style>
                        body {
                            font-family: 'Inter', sans-serif;
                        }
                    </style>
                </head>
                <body class="bg-gray-100 text-gray-800">
                    <div class="container mx-auto p-4 sm:p-6 lg:p-8">
                        <div class="bg-white rounded-2xl shadow-lg p-6">
                            <h1 class="text-2xl md:text-3xl font-bold text-center mb-2 text-purple-700">Idol Blog Posting Frequency</h1>
                            <p class="text-center text-gray-500 mb-6">Blog posts per day for ${year}-${String(month).padStart(2, '0')}</p>
                            <div class="chart-container" style="position: relative; height:60vh; width:100%">
                                <canvas id="blogChart"></canvas>
                            </div>
                        </div>
                    </div>
                    <script>
                        const ctx = document.getElementById('blogChart').getContext('2d');
                        const blogChart = new Chart(ctx, {
                            type: 'line',
                            data: ${JSON.stringify(chartData)},
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: {
                                    x: {
                                        title: {
                                            display: true,
                                            text: 'Date'
                                        }
                                    },
                                    y: {
                                        title: {
                                            display: true,
                                            text: 'Number of Blog Posts'
                                        },
                                        beginAtZero: true,
                                        ticks: {
                                            stepSize: 1
                                        }
                                    }
                                }
                            }
                        });
                    </script>
                </body>
                </html>
            `;

    res.send(html);

});

app.get('/keyaki', async (_, res) => {
    await Keyakizaka46_Crawler();
    res.redirect('/')
})

app.get('/', async (_, res) => {
    const members = await getFullMemberList();
    const desiredNames = await loadDesiredMemberList();

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
    const exportdateLinks = dates
        .map(d => {
            const ymd = formatYYYYMMDD(d);
            return `<a href="/export?date=${ymd}">${ymd}</a>`;
        })
        .join(' ');

    const dateLinks = dates
        .map(d => {
            const ymd = formatYYYYMMDD(d);
            return `<a href="/blogs?date=${ymd}">${ymd}</a>`;
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
                        ${exportdateLinks}
                        </p>
                        <p>
                        <strong>Blogs:</strong>
                        <a href="/blog">default</a>
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

        // 3) pick members to export
        const allMembers = await getFullMemberList();
        const desired = await loadDesiredMemberList();

        // if ?member=Name, only that one; otherwise all desired
        const memberBlogsToExport = member
            ? allMembers.filter(m => m.Name === member && m.Group === group)
            : allMembers.filter(m => desired.includes(m.Name));
ß
        const blogsToExport = blogId
            ? memberBlogsToExport.map(m => ({ Group: m.Group, Name: m.Name, BlogList: m.BlogList.filter(b => b.ID === blogId) }))
            : memberBlogsToExport

        if (!blogsToExport.length) {
            return res.status(404).json({ error: 'No matching members found' });
        }

        // 4) stream zip
        const archive = archiver('zip', { zlib: { level: 9 } });
        res.attachment('DCIM.zip');
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
            //fileSize: formatBytes(archiveEntries.flat().reduce((partialSum, a) => partialSum + a.data.length, 0)),
            cutoffDate: cutoffDate?.toLocaleString("zh-TW", { timeZone: 'ROC' })
        });

    } catch (err) {
        console.error('❌ [EXPORT] error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Member Blogs List
app.get('/blogs', async (req, res) => {
    const { date } = req.query;

    const defaultDate = new Date(Date.now());
    let lastUpdate = defaultDate;
    if (date) {
        const parsed = new Date(parseDateTime(date, 'yyyyMMdd'));
        if (!isNaN(parsed)) lastUpdate = parsed;
    }

    console.log('Blogs on date:', lastUpdate.toISOString());

    const targetYear = parseInt(lastUpdate.getFullYear(), 10);
    const targetMonth = parseInt(lastUpdate.getMonth(), 10);
    const targetDay = parseInt(lastUpdate.getDate(), 10);

    console.log('Blogs on date:', { targetYear, targetMonth, targetDay });
    const blogsOnDate = [];

    const allMembers = await getFullMemberList();
    // Iterate through each member and their blogs
    allMembers.forEach(member => {
        const memberBlogs = member.BlogList.filter(blog => {
            const blogDate = new Date(blog.DateTime);
            return blogDate.getFullYear() === targetYear &&
                blogDate.getMonth() === targetMonth &&
                blogDate.getDate() === targetDay;
        });
        // If the member has blogs on that day, add them to our results
        if (memberBlogs.length > 0) {
            console.log(`Found ${memberBlogs.length} blogs for ${member.Name} on ${date}`);
            blogsOnDate.push(...memberBlogs);
        }
    });


    const rows = blogsOnDate
        .sort((a, b) => b.ID - a.ID)
        .map(blog => `
                        <tr>
                            <td colspan="3">
                                <a href="/members/blog?member=${blog.Name}&blogId=${blog.ID}">
                                    ${blog.Title || "No title"}
                                </a>
                            </td>
                            <td>${blog.Name}</td>
                            <td>${new Date(blog.DateTime).toLocaleString("zh-TW", { timeZone: 'ROC' })}</td>
                            <td>
                                <a href="/export?member=${blog.Name}&blogId=${blog.ID}">
                                    Download
                                </a>
                            </td>
                        </tr>`
        ).join('');

    const htmlbody = `
                    <a href="/">← Back</a>
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

// Member Blogs List
app.get('/members/blogs', async (req, res) => {
    const { member, group } = req.query;
    const allMembers = await getFullMemberList();
    const selected = allMembers.find(m => m.Name === member && m.Group === group);
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
app.get('/members/blog', async (req, res) => {
    const { member, group, blogId } = req.query;
    const allMembers = await getFullMemberList();
    const selected = allMembers.find(m => m.Name === member);
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
                    <h4>Content:</h4>
                    ${blog.Content ?? ""}
                    `
    res.send(getWebsite(htmlbody));
});

// Just an example: "Add desired member" as an API
app.get('/members/add', async (req, res) => {
    const { member } = req.query;
    if (!member) {
        return res.status(400).json({ error: 'member is required' });
    }
    const success = await addDesiredMember(member);
    if (success) {
        res.redirect('/');
    } else {
        return res.status(500).json({ error: 'Unable to add member' });
    }
});

// Just an example: "Add desired member" as an API
app.get('/members/remove', async (req, res) => {
    const { member } = req.query;
    if (member) {
        const success = await removeDesiredMember(member);
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
    const history_photos_col = await getJsonList(Hinatazaka46_History_FilePath);

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
        //fileSize: formatBytes(archiveEntries.reduce((partialSum, a) => partialSum + a.data.length, 0)),
    });
});

app.get('/history/list', async (req, res) => {
    const history_photos_col = await getJsonList(Hinatazaka46_History_FilePath)
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

app.get('/history/col', async (req, res) => {
    const { code } = req.query;
    const history_photos_col = await getJsonList(Hinatazaka46_History_FilePath)
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


const isPollingActive = () => {
    const hour = new Date().getHours(); // 0-23
    return hour >= 6 && hour < 23;
};


const isBokuaoPollingActive = () => {
    const hour = new Date().getHours(); // 0-23
    return hour === 21;
};

async function pollAllGroups() {
    if (!isPollingActive()) {
        return;
    }
    console.log('--- 🔄 Polling all groups ---');
    await Promise.all([
        Hinatazaka46_Blog_Crawler(),
        Sakurazaka46_Blog_Crawler(),
        Nogizaka46_Blog_Crawler()
    ]);

    if (isBokuaoPollingActive()) {
        await Bokuao_Blog_Crawler();
    }
    console.log('--- ✅ Polling completed ---');
}

async function main() {
    console.log('--- 🚀 Starting blog crawler ---');
    if (!POLLING_INTERVAL_MS) {
        console.error('❌ ERROR: Missing or invalid POLLING_INTERVAL_SECONDS in .env');
        process.exit(1);
    }
    await pollAllGroups();
    setInterval(() => pollAllGroups(), POLLING_INTERVAL_MS);
    console.log(`🕒 Polling scheduled to run every ${POLLING_INTERVAL_MS / 1000} seconds.`);
}

main();

