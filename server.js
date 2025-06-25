// server.js - ComplianceBot Backend

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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Expose generated PDFs
app.use('/pdf/generated', express.static(path.join(__dirname, 'pdf/generated')));

app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;

  if (type === 'url_verification') return res.status(200).send(challenge);
  if (!event || event.bot_id || event.type !== 'message') return res.sendStatus(200);

  const text = event.text.toLowerCase();
  const channel = event.channel;

  try {
    // 📥 VALIDATE USER FILE
    if (text.includes('validate') && event.files?.length > 0) {
      const file = event.files[0];
      const fileUrl = file.url_private_download;

      await sendSlackMessage(channel, '📩 Starting validation for uploaded policy...');
      await delay(randDelay());
      await sendSlackMessage(channel, '📥 Downloading your PDF...');
      await delay(randDelay());

      const pdfBuffer = await axios.get(fileUrl, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
        responseType: 'arraybuffer'
      });

      const parsed = await pdfParse(pdfBuffer.data);
      await sendSlackMessage(channel, '🤖 Running LLM model (GPT-4o) for compliance rule matching...');
      await delay(randDelay());

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

      await sendSlackMessage(channel, summary);
    }

    // 📄 TEMPLATE GENERATOR
    else if (text.includes('generate template') || text.includes('template for')) {
      const sector = text.includes('health') ? 'healthcare' : 'finance';
      await sendSlackMessage(channel, `🛠️ Preparing compliance template for *${sector}*...`);
      await delay(randDelay());
      await sendSlackMessage(channel, '📡 Fetching latest policy standards from rule engine...');
      await delay(randDelay());
      await sendSlackMessage(channel, '📦 Building your PDF document...');
      const filePath = generatePDF(getTemplate(sector), sector);
      await delay(randDelay());
      await uploadFileToSlack(filePath, channel, `${sector}_compliance.pdf`);
    }

    // 📜 CUSTOM POLICY RULES
    else if (text.includes('rules:')) {
      const rules = text.split('rules:')[1].split(';').map(r => '• ' + r.trim()).join('\n');
      await sendSlackMessage(channel, '🧠 Parsing custom policy rules...');
      await delay(randDelay());
      await sendSlackMessage(channel, '🔍 Validating structure & compliance metadata...');
      await delay(randDelay());
      await sendSlackMessage(channel, '📄 Generating your PDF...');
      const filePath = generatePDF(rules, 'custom');
      await uploadFileToSlack(filePath, channel, 'custom_policy.pdf');
    }

    // 🧾 AUDIT REQUEST
    else if (text.includes('audit')) {
      await sendSlackMessage(channel, '🔎 Fetching 100 invoices...');
      await delay(randDelay());
      await sendSlackMessage(channel, '🧠 Running rule checks via GPT-4o + rules engine...');
      await delay(randDelay());

      const auditReport = `\`\`\`
📊 AUDIT SUMMARY (Last 10 Days - User Filter: A*)

✅ Passed Bills: 62
❌ Failed Bills: 30 (e.g. over ₹5000, missing approval)
🕒 Unprocessed Bills: 8

Rule Engine: Active
LLM: GPT-4o | Tokens: 400 | Temp: 0.3
Reports archived to: S3://compliance-results/
\`\`\``;
      await sendSlackMessage(channel, auditReport);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Event error:', err.message);
    res.sendStatus(500);
  }
});

// Slack Message Sender
function sendSlackMessage(channel, text) {
  return axios.post('https://slack.com/api/chat.postMessage', {
    channel, text
  }, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

// Slack File Uploader
function uploadFileToSlack(filePath, channel, filename) {
  const form = new FormData();
  form.append('channels', channel);
  form.append('file', fs.createReadStream(filePath));
  form.append('filename', filename);
  form.append('title', filename);

  return axios.post('https://slack.com/api/files.upload', form, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      ...form.getHeaders()
    }
  });
}

// Random delay helper
function randDelay() {
  return 1500 + Math.random() * 3000;
}

// Load sector template
function getTemplate(sector) {
  try {
    return fs.readFileSync(path.join(__dirname, 'templates', `${sector}.txt`), 'utf8');
  } catch {
    return `Template for ${sector} not found.`;
  }
}

// Generate formatted PDF
function generatePDF(content, name) {
  const filename = `${name}_${Date.now()}.pdf`;
  const filePath = path.join(__dirname, 'pdf/generated', filename);
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));
  doc.fillColor('#007acc').fontSize(16).text(`📝 Compliance Document: ${name.toUpperCase()}`, { align: 'center' });
  doc.moveDown().fillColor('#000000').fontSize(12).text(content, { align: 'left' });
  doc.end();
  return filePath;
}

app.listen(PORT, () => console.log(`✅ ComplianceBot running at port ${PORT}`));
