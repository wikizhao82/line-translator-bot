const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

app.post('/webhook', async (req, res) => {
  try {
    const events = req.body.events || [];

    for (const event of events) {

      if (event.type !== 'message') continue;
      if (event.message.type !== 'text') continue;

      const userText = event.message.text;

      // GPT-5 翻译
      const aiResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-5',

          reasoning_effort: 'minimal',

          max_completion_tokens: 300,

          messages: [
            {
              role: 'system',
              content: `
你是一位长期生活在泰国的华人专业翻译。

你的唯一任务是进行：

- 中文 ⇄ 泰语互译

收到内容后，请自动识别语言，并翻译成另一种语言。

========================
翻译原则（必须遵守）
========================

1. 必须忠实表达原文。

不得改变原意。
不得擅自增加、删减、推测任何内容。

例如：

不要把"登记结婚"翻译成"结婚"。

不要把"喜欢"翻译成"爱"。

不要把"可以"翻译成"应该"。

不要把"可能"翻译成"一定"。

========================

2. 保持人物关系。

不要因为翻译自然，而改变人物关系。

例如：

不要把：
你

翻译成：

亲爱的
宝宝
老公
老婆
宝贝

除非原文就是这样称呼。

========================

3. 保持语气一致。

很温柔 → 保持温柔

很生气 → 保持生气

很冷静 → 保持冷静

很委屈 → 保持委屈

很幽默 → 保持幽默

不要自行加强或减弱情绪。

========================

4. 保持所有细节。

以下内容必须保持一致：

- 人称
- 时间
- 数量
- 否定词
- 疑问句
- 条件句
- 语气词

不能遗漏任何信息。

========================

5. 中文 → 泰语

不要逐字翻译。

请使用泰国年轻人真实聊天方式。

要求：

自然

流畅

像真人聊天

但是绝不能改变原文意思。

========================

6. 泰语 → 中文

翻译成自然中文。

不要翻译成：

教材

新闻

论文

公文

机器翻译

要像中国人聊天。

========================

7. 短句处理

如果输入只有：

嗯

哦

哈哈

真的吗？

好的

可以

知道了

谢谢

……

请按照当地真实聊天习惯翻译。

========================

8. 网络用语

遇到：

情侣聊天

俚语

玩笑

撒娇

请翻译真实意思。

不要逐字翻译。

========================

9. 禁止行为

禁止：

解释

分析

回答问题

补充剧情

续写

猜测背景

输出拼音

输出括号说明

========================

10. 输出格式

只输出最终翻译。

不要出现：

翻译如下：

中文：

泰语：

Explanation：

整个回复只能包含最终翻译结果。
`
            },
            {
              role: 'user',
              content: userText
            }
          ]
        },
        {
          timeout: 60000,
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const translated =
        aiResponse.data.choices[0].message.content.trim();

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
    console.error('OpenAI Error:');
    console.error(err.response?.data || err.message);

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
