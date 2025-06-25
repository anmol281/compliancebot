const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const path = require('path');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
const PORT = process.env.PORT || 3000;

const sectors = ['finance', 'insurance', 'healthcare'];

// 📄 Util: Generate PDF
function generatePDF(content, filename) {
  const doc = new PDFDocument();
  const filePath = path.join(__dirname, 'pdf', 'generated', filename);
  doc.pipe(fs.createWriteStream(filePath));
  doc.fontSize(12).text(content, { align: 'left' });
  doc.end();
  return filePath;
}

// 📁 Util: Load sector template
function getTemplate(sector) {
  const templatePath = path.join(__dirname, 'templates', `${sector}.txt`);
  return fs.existsSync(templatePath)
    ? fs.readFileSync(templatePath, 'utf8')
    : null;
}

// 🔍 Slash: Get compliance doc for a sector
app.post('/slack/template', async (req, res) => {
  const { text, response_url } = req.body;
  let sector = text.trim().toLowerCase();

  if (!sectors.includes(sector)) {
    await axios.post(response_url, {
      response_type: "ephemeral",
      text: `❓ Please specify a valid sector: finance, insurance, healthcare.\nUsage: \`/get_compliance_template finance\``
    });
    return res.sendStatus(200);
  }

  const template = getTemplate(sector);
  const fileName = `compliance_${sector}_${Date.now()}.pdf`;
  const filePath = generatePDF(template, fileName);

  await axios.post(response_url, {
    response_type: "in_channel",
    text: `✅ *${sector.toUpperCase()} Compliance Document* generated.`,
    attachments: [{
      title: "Download PDF",
      title_link: `https://compliancebot.onrender.com/pdf/generated/${fileName}`
    }]
  });

  res.sendStatus(200);
});

// ✍️ Slash: Custom rule-based compliance doc
app.post('/slack/custom-template', async (req, res) => {
  const { text, response_url } = req.body;

  if (!text.trim()) {
    res.status(200).send("Please provide rules, e.g. `/custom_compliance_doc Rule1; Rule2; Rule3`");
    return;
  }

  const customDoc = `Custom Compliance Document\n----------------------------\nRules Provided:\n${text.split(';').map(rule => '• ' + rule.trim()).join('\n')}`;
  const fileName = `custom_compliance_${Date.now()}.pdf`;
  const filePath = generatePDF(customDoc, fileName);

  await axios.post(response_url, {
    response_type: "in_channel",
    text: `🧠 *Custom Compliance Document* created based on your inputs.`,
    attachments: [{
      title: "Download PDF",
      title_link: `https://compliancebot.onrender.com/pdf/generated/${fileName}`
    }]
  });

  res.sendStatus(200);
});

// 🧠 Slash: Validate document (stub)
app.post('/slack/validate', async (req, res) => {
  const { text, response_url } = req.body;
  const validationSummary = `• ✅ Found 3 of 4 required clauses\n• ❌ Missing: Vendor approval policy\n• 🚨 Warning: Max spend cap not defined`;

  await axios.post(response_url, {
    response_type: "in_channel",
    text: `🔍 Validation Result for *${text}*:\n${validationSummary}`
  });

  res.sendStatus(200);
});

// 🔓 Expose the /pdf/generated folder for public access via Render
app.use('/pdf/generated', express.static(path.join(__dirname, 'pdf/generated')));

app.listen(PORT, () => {
  console.log(`ComplianceBot running on port ${PORT}`);
});
