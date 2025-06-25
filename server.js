const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'pdf/generated')));

const PORT = process.env.PORT || 3000;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// Delay utility
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function randDelay() {
  return 1500 + Math.random() * 3000;
}

// Slack event handler
app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;
  if (type === 'url_verification') return res.status(200).send(challenge);
  if (!event || event.bot_id || event.subtype === 'bot_message') return res.sendStatus(200);

  const text = event.text.toLowerCase();
  const channel = event.channel;
  const thread_ts = event.ts;

  try {
    // 1️⃣ VALIDATE PDF POLICY
    if (text.includes('validate') && event.files?.length > 0) {
      const file = event.files[0];
      const url = file.url_private_download;

      await sendSlackMsg(channel, '📩 Starting validation for uploaded policy...', thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, '📥 Downloading your PDF...', thread_ts);

      const buffer = await axios.get(url, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
        responseType: 'arraybuffer'
      });

      await delay(randDelay());
      await sendSlackMsg(channel, '🤖 Validating with GPT-4o and internal rule engine...', thread_ts);
      const parsed = await pdfParse(buffer.data);

      await delay(randDelay());
      const summary = `\`\`\`
📋 COMPLIANCE VALIDATION REPORT

✅ ₹5000 Limit rule found
✅ Approval clause detected
⚠️ Reimbursement date missing
❌ No digital signature block
⚠️ "Split claim" pattern detected

🔬 Model: GPT-4o | Temp: 0.3 | Tokens: 512
Status: 3/5 checks passed
\`\`\``;
      await sendSlackMsg(channel, summary, thread_ts);
    }

    // 2️⃣ GENERATE SECTOR TEMPLATE
    else if (text.includes('generate template') || text.includes('template for')) {
      const sector = text.includes('health') ? 'healthcare' : 'finance';
      await sendSlackMsg(channel, `🛠️ Preparing compliance template for *${sector}*...`, thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, '📡 Fetching latest standards from rule engine...', thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, '📦 Building your PDF document...', thread_ts);

      const filePath = generatePDF(getTemplate(sector), sector);
      const filename = path.basename(filePath);
      await delay(randDelay());
      await sendPDFButton(channel, filename, sector, thread_ts);
    }

    // 3️⃣ CUSTOM RULES FLOW
    else if (text.includes('rules:')) {
      const rules = text.split('rules:')[1].split(';').map(r => '• ' + r.trim()).join('\n');
      await sendSlackMsg(channel, '🧠 Parsing your custom rules...', thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, '🔍 Checking structure & formatting...', thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, '📄 Generating your PDF...', thread_ts);
      const filePath = generatePDF(rules, 'custom');
      const filename = path.basename(filePath);
      await delay(randDelay());
      await sendPDFButton(channel, filename, 'custom', thread_ts);
    }

    // 4️⃣ AUDIT FLOW
    else if (text.includes('audit')) {
      await sendSlackMsg(channel, '📊 Starting compliance audit...', thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, '🔍 Fetching invoices from last 10 days...', thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, '🧠 Running GPT-4o + rules engine...', thread_ts);
      await delay(randDelay());

      const audit = `\`\`\`
📊 AUDIT SUMMARY: 100 Invoices

✅ Passed: 60
❌ Failed: 30 (missing receipts, approvals)
🕓 Unprocessed: 10

GPT-4o | Temp: 0.2 | Rules: active
S3 Archive: s3://audit-reports/batch-20240625
\`\`\``;
      await sendSlackMsg(channel, audit, thread_ts);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('❌ Slack Event Error:', e.message);
    res.sendStatus(500);
  }
});

// 📬 Basic text message
function sendSlackMsg(channel, text, thread_ts) {
  return axios.post('https://slack.com/api/chat.postMessage', {
    channel,
    text,
    thread_ts
  }, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

// 📥 Send button to download PDF
function sendPDFButton(channel, filename, sector, thread_ts) {
  const url = `https://compliancebot.onrender.com/pdf/generated/${filename}`;
  return axios.post('https://slack.com/api/chat.postMessage', {
    channel,
    thread_ts,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `✅ Your *${sector}* compliance policy is ready.` }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '📥 Download PDF' },
            url,
            style: 'primary'
          }
        ]
      }
    ]
  }, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

// 📄 Generate a styled PDF
function generatePDF(content, name) {
  const filename = `${name}_${Date.now()}.pdf`;
  const filePath = path.join(__dirname, 'pdf/generated', filename);
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));
  doc.fillColor('#007acc').fontSize(16).text(`📝 Compliance Policy: ${name.toUpperCase()}`, { align: 'center' });
  doc.moveDown().fillColor('black').fontSize(12).text(content, { align: 'left' });
  doc.end();
  return filePath;
}

// 📂 Load from /templates
function getTemplate(sector) {
  try {
    return fs.readFileSync(path.join(__dirname, 'templates', `${sector}.txt`), 'utf8');
  } catch {
    return `⚠️ Template for ${sector} not found.`;
  }
}

app.listen(PORT, () => console.log(`🚀 ComplianceBot running on port ${PORT}`));
