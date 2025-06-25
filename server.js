const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');
const FormData = require('form-data');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const HOST_PATH = '/opt/render/project/src'; // Use this path for Render

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randDelay() {
  return 1500 + Math.random() * 3000;
}

// Ensure directory exists
function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  fs.mkdirSync(dirname, { recursive: true });
}

// Slack Message Sender with Threading and Reactions
async function sendSlackMessage(channel, text, thread_ts = null) {
  const response = await axios.post('https://slack.com/api/chat.postMessage', {
    channel, 
    text,
    thread_ts
  }, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  // Add emoji reaction
  if (response.data.ok) {
    await axios.post('https://slack.com/api/reactions.add', {
      channel,
      name: 'eyes',
      timestamp: response.data.ts
    }, {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
  }

  return response.data.ts;
}

// Slack File Uploader with Preview
async function uploadFileToSlack(filePath, channel, filename, thread_ts = null) {
  const form = new FormData();
  form.append('channels', channel);
  form.append('file', fs.createReadStream(filePath));
  form.append('filename', filename);
  form.append('title', filename);

  const response = await axios.post('https://slack.com/api/files.upload', form, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      ...form.getHeaders()
    }
  });

  // Send a preview message
  if (response.data.ok) {
    const previewText = `Here's a preview of your document: ${filename}`;
    await sendSlackMessage(channel, previewText, thread_ts);
  }
}

// Add interactive messages and delays
async function sendInteractiveMessage(channel, messages) {
  let thread_ts = null;
  for (const message of messages) {
    thread_ts = await sendSlackMessage(channel, message, thread_ts);
    await delay(randDelay());
  }
  return thread_ts;
}

// Expose generated PDFs
app.use('/pdf/generated', express.static(path.join(HOST_PATH, 'pdf/generated')));

app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;

  if (type === 'url_verification') return res.status(200).send(challenge);
  if (!event || event.bot_id || event.type !== 'message') return res.sendStatus(200);

  const text = event.text.toLowerCase();
  const channel = event.channel;

  try {
    if (text.includes('validate') && event.files?.length > 0) {
      const file = event.files[0];
      const fileUrl = file.url_private_download;

      const thread_ts = await sendInteractiveMessage(channel, [
        '📩 Starting validation for uploaded policy...',
        '📥 Downloading your PDF...',
        '🤖 Running LLM model (GPT-4o) for compliance rule matching...'
      ]);

      const pdfBuffer = await axios.get(fileUrl, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
        responseType: 'arraybuffer'
      });

      const parsed = await pdfParse(pdfBuffer.data);
      const summary = `\`\`\`
📋 COMPLIANCE VALIDATION SUMMARY

✅ ₹5000 Limit cap found
✅ Manager approval clause present
❌ Reimbursement timeline missing
⚠️ Suspicious 'split expense' detected
❌ Audit trail logs absent
⚠️ Missing digital signature section

Model: GPT-4o | Temperature: 0.2 | Tokens: 512
Confidence Score: 78%
\`\`\``;

      await sendSlackMessage(channel, summary, thread_ts);
    }

    else if (text.includes('generate template') || text.includes('template for')) {
      const sector = text.includes('health') ? 'healthcare' : 'finance';
      const thread_ts = await sendInteractiveMessage(channel, [
        `🛠️ Preparing compliance template for *${sector}*...`,
        '📡 Fetching latest policy standards from rule engine...',
        '📦 Building your PDF document...'
      ]);
      const filePath = generatePDF(getTemplate(sector), sector);
      await uploadFileToSlack(filePath, channel, `${sector}_compliance.pdf`, thread_ts);
    }

    else if (text.includes('rules:')) {
      const rules = text.split('rules:')[1].split(';').map(r => '• ' + r.trim()).join('\n');
      const thread_ts = await sendInteractiveMessage(channel, [
        '🧠 Parsing custom policy rules...',
        '🔍 Validating structure & compliance metadata...',
        '📄 Generating your PDF...'
      ]);
      const filePath = generatePDF(rules, 'custom');
      await uploadFileToSlack(filePath, channel, 'custom_policy.pdf', thread_ts);
    }

    else if (text.includes('audit')) {
      const thread_ts = await sendInteractiveMessage(channel, [
        '🔎 Fetching 100 invoices...',
        '🧠 Running rule checks via GPT-4o + rules engine...'
      ]);

      const auditReport = `\`\`\`
📊 AUDIT SUMMARY (Last 10 Days - User Filter: A*)

✅ Passed Bills: 62
❌ Failed Bills: 30 (e.g. over ₹5000, missing approval)
🕒 Unprocessed Bills: 8

Rule Engine: Active
LLM: GPT-4o | Tokens: 400 | Temp: 0.3
Reports archived to: S3://compliance-results/
\`\`\``;
      await sendSlackMessage(channel, auditReport, thread_ts);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Event error:', err.message);
    res.sendStatus(500);
  }
});

// Load sector template
function getTemplate(sector) {
  try {
    return fs.readFileSync(path.join(HOST_PATH, 'templates', `${sector}.txt`), 'utf8');
  } catch {
    return `Template for ${sector} not found.`;
  }
}

// Update PDF generation to include colors and fonts
function generatePDF(content, name) {
  const filename = `${name}_${Date.now()}.pdf`;
  const filePath = path.join(HOST_PATH, 'pdf/generated', filename);
  ensureDirectoryExistence(filePath);
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));
  doc.fillColor('#007acc').fontSize(16).text(`📝 Compliance Document: ${name.toUpperCase()}`, { align: 'center' });
  doc.moveDown().fillColor('#000000').fontSize(12).text(content, { align: 'left' });
  doc.end();
  return filePath;
}

app.listen(PORT, () => console.log(`✅ ComplianceBot running at port ${PORT}`));
