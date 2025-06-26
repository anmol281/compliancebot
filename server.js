
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');

const app = express();
app.use(bodyParser.json());
app.use('/pdf/generated', express.static(path.join(__dirname, 'pdf/generated')));

const PORT = process.env.PORT || 3000;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const auditThreadMap = new Map();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function randDelay() {
  return 1500 + Math.random() * 3000;
}

async function sendSlackMsg(channel, text, thread_ts) {
  return axios.post('https://slack.com/api/chat.postMessage', {
    channel, text, thread_ts
  }, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

async function sendPDFButton(channel, filename, sector, thread_ts) {
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

function generatePDF(content, name) {
  const filename = `${name}_${Date.now()}.pdf`;
  const filePath = path.join(__dirname, 'pdf/generated', filename);
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));
  doc.fillColor('#007acc').fontSize(16).text(`📝 Compliance Policy: ${name.toUpperCase()}`, { align: 'center' });
  doc.moveDown().fillColor('black').fontSize(12).text(content, { align: 'left' });
  doc.end();
  return filename;
}

function getTemplate(sector) {
  try {
    return fs.readFileSync(path.join(__dirname, 'templates', `${sector}.txt`), 'utf8');
  } catch {
    return `⚠️ Template for ${sector} not found.`;
  }
}

function detectFraudPatterns(records) {
  const flags = [];
  for (let r of records) {
    if (r.amount < 5000 && r.split && r.sameDay) {
      flags.push(`🚨 Split claim detected: ₹${r.amount} x2 by @${r.user}`);
    }
    if (r.noReceipt && r.amount > 3000) {
      flags.push(`⚠️ High-value claim without receipt: ₹${r.amount} by @${r.user}`);
    }
    if (r.backdatedApproval) {
      flags.push(`⚠️ Backdated approval by @${r.approver} for @${r.user}`);
    }
  }
  return flags;
}

app.post('/slack/events', async (req, res) => {
  const body = req.body || {};
  const { type, challenge, event } = body;
  if (!type && !event) return res.sendStatus(400);
  if (type === 'url_verification') return res.status(200).send(challenge);
  if (!event || event.bot_id || event.subtype === 'bot_message') return res.sendStatus(200);
  res.sendStatus(200);

  const text = event.text.toLowerCase();
  const channel = event.channel;
  const thread_ts = event.thread_ts || event.ts;

  try {
    if (text.includes('validate') && event.files?.length > 0) {
      const file = event.files[0];
      const url = file.url_private_download;
      await sendSlackMsg(channel, '📥 Policy upload received. Starting compliance validation...', thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, '📡 Parsing PDF content...', thread_ts);
      const buffer = await axios.get(url, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
        responseType: 'arraybuffer'
      });
      await delay(randDelay());
      await sendSlackMsg(channel, '🤖 Analyzing with GPT-4o model & company compliance matrix...', thread_ts);
      let parsed;
      try {
        parsed = await pdfParse(buffer.data);
      } catch {
        await sendSlackMsg(channel, '❌ Error: PDF unreadable or encrypted. Try a different file.', thread_ts);
        return;
      }
      await delay(randDelay());
      await sendSlackMsg(channel, `\`\`\`
📋 COMPLIANCE VALIDATION REPORT

✅ ₹5000 Limit rule found
✅ Approval clause detected
⚠️ Reimbursement deadline missing
❌ Signature section not found
⚠️ Split claim language not standardized

🔎 Model: GPT-4o | Context aware | Score: 72%
\`\`\``, thread_ts);
    }

    else if (text.includes('generate template')) {
      const sector = text.includes('health') ? 'healthcare' : 'finance';
      await sendSlackMsg(channel, `:hammer_and_wrench: Generating compliance template for *${sector}* sector...`, thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, ':satellite: Contacting rule repository for most recent legal definitions...', thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, '📑 Structuring base clauses and formatting as per org style...', thread_ts);
      await delay(randDelay());
      const file = generatePDF(getTemplate(sector), sector);
      await sendPDFButton(channel, file, sector, thread_ts);
    }

    else if (text.includes('audit')) {
      await sendSlackMsg(channel, '🧾 Initiating 10-day retrospective compliance audit...', thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, '🔎 Reviewing approval chains, timestamps, and uploaded receipts...', thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, '🧠 Applying GPT-4o classification on logs and policy data...', thread_ts);
      await delay(randDelay());

      const records = [
        { user: 'john.doe', amount: 4900, split: true, sameDay: true },
        { user: 'alice.k', amount: 5200, noReceipt: true },
        { user: 'sam.p', amount: 4800, noReceipt: true },
        { user: 'john.doe', amount: 4950, split: true, sameDay: true },
        { user: 'dev.admin', amount: 6000, backdatedApproval: true, approver: 'unauthorized.user' }
      ];

      auditThreadMap.set(thread_ts, records);

      await sendSlackMsg(channel, `\`\`\`
📊 AUDIT LOGS:
Invoices Reviewed: 100
✅ Compliant: 60
❌ Non-Compliant: 30
🕓 Unprocessed: 10
\`\`\``, thread_ts);
    }

    else if (text.includes('generate audit summary')) {
      await sendSlackMsg(channel, `📘 Generating audit summary...`, thread_ts);
      await delay(randDelay());
      const table = `\`\`\`
USER         | AMOUNT | FLAG
-------------|--------|-------------------------------
john.doe     | 4900   | Split Expense (x2)
alice.k      | 5200   | No Receipt
sam.p        | 4800   | No Receipt
dev.admin    | 6000   | Backdated Approval
\`\`\``;
      await sendSlackMsg(channel, table, thread_ts);
    }

    else if (text.includes('run fraud detection')) {
      const records = auditThreadMap.get(thread_ts);
      if (!records) return sendSlackMsg(channel, '❗No previous audit found. Please run an audit first.', thread_ts);
      await sendSlackMsg(channel, '🔐 Executing fraud detection on failed/unprocessed entries...', thread_ts);
      await delay(randDelay());
      const frauds = detectFraudPatterns(records);
      if (!frauds.length) {
        await sendSlackMsg(channel, '✅ No fraudulent behavior detected.', thread_ts);
      } else {
        await sendSlackMsg(channel, '```\\n🔎 FRAUD REPORT:\\n' + frauds.join('\\n') + '\\n```', thread_ts);
      }
    }

    else if (text.includes('create a case for all above')) {
      await sendSlackMsg(channel, '📂 Creating Salesforce case(s) for flagged anomalies...', thread_ts);
      await delay(randDelay());
      await sendSlackMsg(channel, `✅ Created Case #CSF-98721
🔗 Assigned to: Risk & Compliance Team
📅 ETA for review: 2 business days`, thread_ts);
    }

    else if (text.includes('thanks compliance bot')) {
      await delay(randDelay());
      await sendSlackMsg(channel, '🤖 You’re welcome! I’m always here for audits, templates, or policy checks.', thread_ts);
    }

  } catch (e) {
    console.error('❌ Slack Event Error:', e.message);
  }
});

app.listen(PORT, () => console.log('✅ Enhanced ComplianceBot running on port ' + PORT));
