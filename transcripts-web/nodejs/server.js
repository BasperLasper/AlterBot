const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();

const transcriptsDir = path.join(__dirname, 'public', 'transcripts');

// You might want to edit these
const PORT = 3001;
const siteTitle = 'AlterHaven Ticket Transcript';
const ogImage = 'https://cdn.discordapp.com/icons/721067131906818098/fe98eddd7c24281248e7a3ef061d6aca.png?size=128';
const siteDescription = 'Support ticket conversation transcript.';

// Create base transcripts folder if missing
if (!fs.existsSync(transcriptsDir)) {
  fs.mkdirSync(transcriptsDir, { recursive: true });
}

// Log every incoming request
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, transcriptsDir);
  },
  filename: (req, file, cb) => {
    const channelId = req.body.channel_id?.replace(/[^\w-]/g, '') || 'unknown';
    const random = crypto.randomBytes(6).toString('hex');
    const filename = `ticket-${channelId}_${random}.html`;
    cb(null, filename);
  }
});

const upload = multer({ storage });

// Serve transcript with metadata
app.get('/transcripts/:filename', (req, res) => {
  const filename = req.params.filename.replace(/[^\w\-.]/g, '');
  const filePath = path.join(transcriptsDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Transcript not found.');
  }

  const htmlContent = fs.readFileSync(filePath, 'utf-8');

  const wrappedHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta property="og:title" content="${siteTitle}" />
        <meta property="og:description" content="${siteDescription}" />
        <meta property="og:image" content="${ogImage}" />
        <meta name="twitter:card" content="summary_large_image" />
        <title>${siteTitle}</title>
        <style>body, html { margin:0; padding:0; height:100%; }</style>
      </head>
      <body>
        <iframe srcdoc="${htmlContent
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}" style="width:100%; height:100%; border:none;"></iframe>
      </body>
    </html>
  `;

  res.type('html').send(wrappedHtml);
});

// Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file || !req.body.channel_id) {
    console.warn('⚠️ Missing file or channel_id in upload.');
    return res.status(400).json({ error: 'Missing file or channel_id' });
  }

  console.log(`✅ Uploaded: ${req.file.filename}`);
  res.json({ url: `/transcripts/${req.file.filename}` });
});

// Status endpoint
app.get('/', (req, res) => {
  res.send('📎 Transcript upload server running.');
});

app.listen(PORT, () => {
  console.log(`🟢 Transcript upload server is running at http://localhost:${PORT}`);
});
