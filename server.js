const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Slash: Generate Template
app.post('/slack/template', async (req, res) => {
  const { text, response_url } = req.body;
  const industry = text.trim() || "generic";

  res.status(200).send(`📄 Generating a ${industry} compliance template...`);

  const documentText = await generateTemplate(industry); // Call to LLM or hardcoded logic

  await axios.post(response_url, {
    response_type: "in_channel",
    text: `Here’s your base *${industry} compliance document*:\n\n${documentText}`,
  });
});

// Slash: Validate uploaded doc (simplified for now)
app.post('/slack/validate', async (req, res) => {
  const { text, response_url } = req.body;

  res.status(200).send(`🧐 Validating document: *${text}*...`);

  const validation = await validateDocument(text); // placeholder

  await axios.post(response_url, {
    response_type: "in_channel",
    text: `✅ *Validation Summary*:\n${validation}`,
  });
});

async function generateTemplate(industry) {
  const prompts = {
    finance: `Finance compliance policy template:
1. All expenses above ₹5,000 require receipt.
2. Monthly reconciliation is mandatory.
3. Vendor approval required before PO issuance.`,
    health: `Health compliance template:
1. Patient consent must be documented.
2. HIPAA-compliant data handling.
3. Retention period: 7 years minimum.`,
  };
  return prompts[industry.toLowerCase()] || prompts["finance"];
}

async function validateDocument(input) {
  // Simulated response (use LLM in real case)
  return `• Found: 3 of 5 required clauses\n• Missing: Vendor approval\n• Suggestion: Add clause on monthly audits`;
}

app.listen(PORT, () => {
  console.log(`Slack ComplianceBot running on port ${PORT}`);
});
