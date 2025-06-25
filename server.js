
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

// 🔁 Slack Events Handler
app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;

  // Respond to Slack's URL verification
  if (type === 'url_verification') {
    return res.status(200).send(challenge);
  }

  // Handle bot messages
  if (event && (event.type === 'message' || event.type === 'app_mention')) {
    const userMessage = event.text;
    const channel = event.channel;

    const reply = await handleMessageIntent(userMessage);

    await axios.post('https://slack.com/api/chat.postMessage', {
      channel: channel,
      text: reply.text,
    }, {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      }
    });
  }

  res.sendStatus(200);
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
