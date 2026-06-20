const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

app.post('/webhook', async (req, res) => {
  try {
    const events = req.body.events;

    for (const event of events) {

      if (event.type !== 'message') continue;
      if (event.message.type !== 'text') continue;

      const userText = event.message.text;

      const aiResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `
你是专业翻译助手。

如果用户输入中文：
翻译成自然泰语。

如果用户输入泰语：
翻译成自然中文。

不要解释。
不要添加额外内容。
只输出翻译结果。
`
            },
            {
              role: 'user',
              content: userText
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const translated =
        aiResponse.data.choices[0].message.content;

      await axios.post(
        'https://api.line.me/v2/bot/message/reply',
        {
          replyToken: event.replyToken,
          messages: [
            {
              type: 'text',
              text: translated
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
          }
        }
      );
    }

    res.sendStatus(200);

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => {
  res.send('LINE Translator Bot Running');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
