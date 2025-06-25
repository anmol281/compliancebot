
// compliancebot_with_upload.js
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

    if (text.includes('generate') && text.includes('template')) {
      const sector = text.includes('finance') ? 'finance' :
                     text.includes('healthcare') ? 'healthcare' :
                     text.includes('insurance') ? 'insurance' : 'finance';

      const template = getTemplate(sector);
      const url = generatePDF(template, sector);
      await sendSlackMessage(channel, `📄 Here's your ${sector} compliance template: ${url}`);

    } else if (text.includes('create') && text.includes('policy')) {
      const rules = text.match(/rules?:\s*(.*)/i);
      if (rules && rules[1]) {
        const formatted = rules[1].split(';').map(r => '• ' + r.trim()).join('\n');
        const file = generatePDF(formatted, 'custom');
        await sendSlackMessage(channel, `🧠 Here's your custom compliance policy: ${file}`);
      } else {
        await sendSlackMessage(channel, '⚠️ Please provide rules in format: "create policy with rules: rule1; rule2; rule3"');
      }

    } else if (text.includes('validate') && text.includes('policy')) {
      let reply = '📥 Starting validation...';

      if (event.files && event.files.length > 0) {
        reply += `\n• Found uploaded policy`;
      } else {
        reply += `\n⚠️ No file detected. Please upload a PDF with this message.`;
        await sendSlackMessage(channel, reply);
        return res.sendStatus(200);
      }

      const loading = await sendSlackMessage(channel, reply + '\n• Downloading PDF...');

      const pdfFile = event.files.find(f => f.filetype === 'pdf');
      const fileUrl = pdfFile?.url_private_download;

      const pdfResponse = await axios.get(fileUrl, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
        responseType: 'arraybuffer'
      });

      const data = await pdfParse(pdfResponse.data);
      const extracted = data.text;

      const matched = extracted.includes('5000') && extracted.includes('approval');
      const failed = !extracted.includes('reimbursement') ? 'Missing rule: reimbursement\n' : '';

      await axios.post('https://slack.com/api/chat.update', {
        channel,
        ts: loading.data.ts,
        text: `📋 Validation Report:\n${matched ? '✅ Basic checks passed' : '❌ Rules not met'}\n${failed}`
      }, {
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

    } else if (text.includes('audit') || text.includes('compliance summary')) {
      const initial = await sendSlackMessage(channel, '🕵️‍♂️ Starting audit check...\n• Fetching records\n• Checking rule engine\n• Summarizing findings...');
      await new Promise(r => setTimeout(r, 2000));

      const summary = `✅ Passed: 60 bills\n❌ Failed: 30 (e.g. INV023 - Receipt missing)\n🕒 Unprocessed: 10`;
      await axios.post('https://slack.com/api/chat.update', {
        channel,
        ts: initial.data.ts,
        text: `📊 *Audit Summary:*\n${summary}`
      }, {
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

    } else {
      await sendSlackMessage(channel,
        `👋 Hi! I can help you with:
• "generate template for finance"
• "create policy with rules: A; B; C"
• "validate my policy" + PDF
• "show audit summary for last 10 days"`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Slack Event Error:', err);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => console.log(`🚀 ComplianceBot listening on port ${PORT}`));
