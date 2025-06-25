
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// ✅ Expose PDFs
app.use('/pdf/generated', express.static(path.join(__dirname, 'pdf/generated')));

app.post('/slack/events', express.json(), async (req, res) => {
  try {
    const { type, challenge, event } = req.body;

    // 🔐 Step 1: Handle Slack URL verification (only once during setup)
    if (type === 'url_verification') {
      return res.status(200).send(challenge);
    }

    // 🧠 Step 2: Respond to actual Slack message events
    if (event && event.type === 'message' && !event.bot_id) {
      console.log('✅ Message received:', event.text);

      // 👋 Echo back a reply using Slack API
      await axios.post('https://slack.com/api/chat.postMessage', {
        channel: event.channel,
        text: `👋 Hello! You said: "${event.text}"`
      }, {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
    }

    // ✅ Always respond quickly to Slack
    res.sendStatus(200);

  } catch (error) {
    console.error('❌ Slack event handling failed:', error);
    res.sendStatus(500);
  }
});



// 🧠 Intent Router (Simulated or LLM)
async function handleMessageIntent(message) {
  message = message.toLowerCase();
  if (message.includes('finance')) {
    const content = getTemplate('finance');
    const file = generatePDF(content, 'finance');
    return { text: `📄 Here is your Finance compliance doc: ${file}` };
  } else if (message.includes('healthcare')) {
    const content = getTemplate('healthcare');
    const file = generatePDF(content, 'healthcare');
    return { text: `📄 Healthcare compliance doc ready: ${file}` };
  } else if (message.includes('rules') || message.includes(';')) {
    const rules = message.split(';').map(r => '• ' + r.trim()).join('\n');
    const file = generatePDF(rules, 'custom');
    return { text: `🧠 Generated your custom policy doc: ${file}` };
  }
  return { text: '❓ Sorry, I did not understand. Try "generate finance compliance" or "rules: A; B; C"' };
}

// 🗂 Template Loader
function getTemplate(sector) {
  try {
    return fs.readFileSync(path.join(__dirname, 'templates', `${sector}.txt`), 'utf8');
  } catch {
    return `Compliance template for ${sector} is not available.`;
  }
}

// 📄 PDF Generator
function generatePDF(content, prefix) {
  const filename = `${prefix}_${Date.now()}.pdf`;
  const filePath = path.join(__dirname, 'pdf/generated', filename);
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));
  doc.text(content);
  doc.end();
  return `https://compliancebot.onrender.com/pdf/generated/${filename}`;
}

app.listen(PORT, () => {
  console.log(`ComplianceBot running at port ${PORT}`);
});
