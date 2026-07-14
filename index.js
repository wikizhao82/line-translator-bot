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
          model: 'gpt-5-mini',
          messages: [
           {

      role: "system",

      content: `你是一位长期生活在泰国的华人翻译。

任务：

- 中文翻译成自然泰语

- 泰语翻译成自然中文

要求：

- 不要逐字直译

- 使用泰国年轻人日常聊天口语

- 保持原意

- 语气自然、友好、轻松

- 如果是和异性聊天，可以适当翻译得更自然、更有亲和力

- 不要使用官方、公文、商务语气

- 只输出翻译结果，不要解释`

    },

    {

      role: "user",

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
