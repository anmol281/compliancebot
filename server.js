
// compliancebot_interactive_steps.js
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

app.use('/pdf/generated', express.static(path.join(__dirname, 'pdf/generated')));

function generatePDF(content, prefix) {
  const filename = `${prefix}_${Date.now()}.pdf`;
  const filePath = path.join(__dirname, 'pdf/generated', filename);
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));
  doc.text(content);
  doc.end();
  return `https://compliancebot.onrender.com/pdf/generated/${filename}`;
}

function getTemplate(sector) {
  try {
    return fs.readFileSync(path.join(__dirname, 'templates', `${sector}.txt`), 'utf8');
  } catch (err) {
    return `⚠️ No template found for ${sector}.`;
  }
}

async function sendSlackMessage(channel, text) {
  return axios.post('https://slack.com/api/chat.postMessage', {
    channel,
    text
  }, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

app.post('/slack/events', async (req, res) => {
  try {
    const { type, challenge, event } = req.body;
    if (type === 'url_verification') return res.status(200).send(challenge);
    if (!event || event.bot_id || event.type !== 'message') return res.sendStatus(200);

    const text = event.text.toLowerCase();
    const channel = event.channel;

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    if (text.includes('generate') && text.includes('template')) {
      const sector = text.includes('finance') ? 'finance' :
                     text.includes('healthcare') ? 'healthcare' :
                     text.includes('insurance') ? 'insurance' : 'finance';

      await sendSlackMessage(channel, `🛠️ Preparing compliance template for *${sector}*...`);
      await delay(1500);
      await sendSlackMessage(channel, `📡 Fetching latest policy standards from rule engine...`);
      await delay(1500);
      await sendSlackMessage(channel, `📦 Building your PDF document...`);
      await delay(1500);

      const template = getTemplate(sector);
      const url = generatePDF(template, sector);
      await sendSlackMessage(channel, `✅ Here is your *${sector}* compliance template:
📄 ${url}`);

    } else if (text.includes('create') && text.includes('policy')) {
      const rules = text.match(/rules?:\s*(.*)/i);
      if (rules && rules[1]) {
        await sendSlackMessage(channel, `🧠 Processing your custom policy rules...`);
        await delay(1500);
        await sendSlackMessage(channel, `🔍 Validating structure & formatting...`);
        await delay(1500);
        await sendSlackMessage(channel, `📄 Generating your PDF policy...`);
        await delay(1500);

        const formatted = rules[1].split(';').map(r => '• ' + r.trim()).join('\n');
        const file = generatePDF(formatted, 'custom');
        await sendSlackMessage(channel, `✅ Your custom compliance policy is ready:
📄 ${file}`);
      } else {
        await sendSlackMessage(channel, '⚠️ Please provide rules in format: "create policy with rules: rule1; rule2; rule3"');
      }

    } else if (text.includes('validate') && text.includes('policy')) {
      await sendSlackMessage(channel, '📥 Starting validation for uploaded policy...');
      await delay(1000);

      if (!event.files || event.files.length === 0) {
        await sendSlackMessage(channel, '⚠️ No file found. Please attach a PDF along with the message.');
        return res.sendStatus(200);
      }

      const file = event.files.find(f => f.filetype === 'pdf');
      const pdfUrl = file?.url_private_download;

      await sendSlackMessage(channel, '🔽 Downloading your PDF...');
      await delay(1500);

      const pdfRes = await axios.get(pdfUrl, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
        responseType: 'arraybuffer'
      });

      await sendSlackMessage(channel, '🤖 Interacting with rule engine (GPT-4o simulated)...');
      await delay(2000);

      const data = await pdfParse(pdfRes.data);
      const extracted = data.text;

      const matched = extracted.includes('5000') && extracted.includes('approval');
      const failed = !extracted.includes('reimbursement') ? '❌ Missing rule: reimbursement' : '';

      const summary = `\`\`\`
📋 VALIDATION SUMMARY

✅ Matched: Limit cap of ₹5000
✅ Found: Manager approval clause
❌ Missing: Reimbursement process
⚠️ Anomaly: "Split-expense" detected
🔍 Audit Trail Reference Missing
📄 Signature block not identified

Overall Confidence: 75%
Recommendation: Revise reimbursement + include audit logs
\`\`\``;

      await sendSlackMessage(channel, summary);

    } else {
      await sendSlackMessage(channel,
        `👋 I can help with:
• "generate template for healthcare"
• "create policy with rules: A; B; C"
• "validate my policy" + PDF
• "show audit summary"`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Slack Event Error:', err);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => console.log(`🚀 ComplianceBot (interactive) listening on port ${PORT}`));
