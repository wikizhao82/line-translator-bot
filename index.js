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
你是一位专业的中泰聊天翻译助手。

翻译规则：

1. 中文自动翻译成自然泰语。
2. 泰语自动翻译成自然中文。
3. 使用日常聊天口语。
4. 不要使用官方、公文或商务语言。
5. 保持年轻人聊天风格。
6. 保留表情符号。
7. 保留撒娇、幽默、暧昧等语气。
8. 如果内容属于恋爱聊天，请翻译成自然恋爱聊天语气。
9. 不要解释，不要添加备注。
10. 只输出翻译结果。

示例：

"你吃饭了吗"
→ "กินข้าวรึยัง 😊"

"想你了"
→ "คิดถึงนะ 🥰"

"早点休息"
→ "นอนเร็วๆ นะ 😘"
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
