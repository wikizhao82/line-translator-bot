const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

/* =========================================================
   环境变量
========================================================= */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;

if (!OPENAI_API_KEY) {
  throw new Error('缺少环境变量 OPENAI_API_KEY');
}

if (!LINE_ACCESS_TOKEN) {
  throw new Error('缺少环境变量 LINE_ACCESS_TOKEN');
}

if (!LINE_CHANNEL_SECRET) {
  throw new Error('缺少环境变量 LINE_CHANNEL_SECRET');
}

/* =========================================================
   Express 配置

   LINE 签名验证需要原始请求内容，所以必须保留 rawBody。
========================================================= */

app.use(
  express.json({
    limit: '1mb',

    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    }
  })
);

/* =========================================================
   翻译系统提示词
========================================================= */

const SYSTEM_PROMPT = `
你是一位长期生活在泰国的华人专业翻译。

你的唯一任务是进行中文和泰语之间的互译。

系统会明确告诉你翻译方向，你必须严格按照指定方向翻译。

==================================================
一、最重要的翻译规则
==================================================

1. 必须完整翻译全文。

不得只翻译一部分。
不得保留尚未翻译的原文。
不得直接返回原文。
不得输出中文和泰语混合的句子。

2. 中文翻译成泰语时：

整个翻译结果必须使用泰语。
翻译结果中不得保留任何中文汉字。

3. 泰语翻译成中文时：

整个翻译结果必须使用中文。
翻译结果中不得保留任何泰文字母。

4. 以下内容可以保留原样：

- 数字
- 英文人名
- 英文品牌
- 英文缩写
- 网址
- 邮箱
- 表情符号
- 车牌号码
- 订单编号

除此之外，不得保留原语言文字。

==================================================
二、忠实表达原文
==================================================

5. 不得改变原意。

不得擅自增加、删减、解释、推测或补充内容。

例如：

不得把“登记结婚”翻译成“结婚”。
不得把“喜欢”翻译成“爱”。
不得把“可以”翻译成“应该”。
不得把“可能”翻译成“一定”。

6. 必须保留以下信息：

- 人称
- 人物关系
- 时间
- 数量
- 否定词
- 疑问句
- 条件句
- 因果关系
- 语气词
- 情绪强度

==================================================
三、人物关系与称呼
==================================================

7. 不得擅自增加称呼。

不得把普通的“你”擅自翻译成：

- 亲爱的
- 宝贝
- 宝宝
- 老公
- 老婆
- ที่รัก

除非原文中本来就有这样的称呼。

8. 不得擅自改变代词、性别或人物关系。

无法确定性别时，应使用自然且不擅自确定性别的表达。

==================================================
四、语言自然度
==================================================

9. 中文翻译成泰语时：

使用泰国年轻人在 LINE 中真实、自然、流畅的聊天表达。

不得逐字硬译。
不得写成教材、公文、新闻或机器翻译风格。
但自然表达不能改变原文意思。

10. 泰语翻译成中文时：

使用中国人真实、自然的聊天表达。

不得翻译成教材、公文、论文、新闻或生硬机器翻译风格。

11. 遇到以下内容时，应翻译真实含义：

- 情侣聊天
- 日常口语
- 网络用语
- 玩笑
- 撒娇
- 俚语
- 成语
- 俗语
- 反话
- 情绪表达

不得因为词语抽象、口语化或难以直译而保留原文。

==================================================
五、情绪和语气
==================================================

12. 保持原文情绪强度：

温柔就保持温柔。
生气就保持生气。
冷静就保持冷静。
委屈就保持委屈。
讽刺就保持讽刺。
幽默就保持幽默。

不得自行增强或减弱情绪。

==================================================
六、禁止行为
==================================================

13. 禁止：

- 解释
- 分析
- 回答原文中的问题
- 补充背景
- 猜测剧情
- 续写
- 总结
- 输出拼音
- 输出括号说明
- 输出语言标签
- 输出“翻译如下”
- 输出多个翻译版本
- 重复原文

==================================================
七、输出格式
==================================================

14. 整个回复只能包含最终翻译结果。

输出之前必须检查：

中文转泰语：
结果中不得出现中文汉字。

泰语转中文：
结果中不得出现泰文字母。

如发现仍有原语言文字，必须继续翻译后再输出。
`.trim();

/* =========================================================
   HTTP 客户端
========================================================= */

const openaiClient = axios.create({
  baseURL: 'https://api.openai.com/v1',

  timeout: 60000,

  headers: {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

const lineClient = axios.create({
  baseURL: 'https://api.line.me/v2/bot',

  timeout: 15000,

  headers: {
    Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

/* =========================================================
   文字检测
========================================================= */

/**
 * 检测字符串中是否包含中文汉字。
 */
function containsChinese(text) {
  return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(text);
}

/**
 * 检测字符串中是否包含泰文字母。
 */
function containsThai(text) {
  return /[\u0E00-\u0E7F]/u.test(text);
}

/**
 * 统计中文汉字数量。
 */
function countChinese(text) {
  const matches = text.match(
    /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/gu
  );

  return matches ? matches.length : 0;
}

/**
 * 统计泰文字母数量。
 */
function countThai(text) {
  const matches = text.match(/[\u0E00-\u0E7F]/gu);

  return matches ? matches.length : 0;
}

/**
 * 判断翻译方向。
 *
 * 返回：
 * zh_to_th = 中文翻译成泰语
 * th_to_zh = 泰语翻译成中文
 */
function detectTranslationDirection(text) {
  const chineseCount = countChinese(text);
  const thaiCount = countThai(text);

  if (chineseCount === 0 && thaiCount === 0) {
    return null;
  }

  /*
   * 混合语言时，以字符数量较多的一方作为原语言。
   */
  if (thaiCount > chineseCount) {
    return 'th_to_zh';
  }

  return 'zh_to_th';
}

/* =========================================================
   翻译结果验证
========================================================= */

/**
 * 防止模型直接照抄原文。
 */
function isSameAsOriginal(original, translated) {
  const normalize = value =>
    String(value)
      .replace(/\s+/gu, '')
      .replace(/[。！？!?.,，、"'“”‘’]/gu, '')
      .toLowerCase();

  return normalize(original) === normalize(translated);
}

/**
 * 检查翻译结果是否符合目标语言。
 */
function validateTranslation(original, translated, direction) {
  if (!translated || typeof translated !== 'string') {
    return {
      valid: false,
      reason: '模型返回了空内容'
    };
  }

  const result = translated.trim();

  if (!result) {
    return {
      valid: false,
      reason: '翻译结果为空'
    };
  }

  if (isSameAsOriginal(original, result)) {
    return {
      valid: false,
      reason: '翻译结果与原文相同'
    };
  }

  if (direction === 'zh_to_th') {
    if (containsChinese(result)) {
      return {
        valid: false,
        reason: '中文翻译成泰语后仍然包含中文汉字'
      };
    }

    if (!containsThai(result)) {
      return {
        valid: false,
        reason: '中文翻译成泰语后没有检测到泰文字母'
      };
    }
  }

  if (direction === 'th_to_zh') {
    if (containsThai(result)) {
      return {
        valid: false,
        reason: '泰语翻译成中文后仍然包含泰文字母'
      };
    }

    if (!containsChinese(result)) {
      return {
        valid: false,
        reason: '泰语翻译成中文后没有检测到中文汉字'
      };
    }
  }

  return {
    valid: true,
    reason: null
  };
}

/* =========================================================
   OpenAI 翻译
========================================================= */

/**
 * 从 Chat Completions 返回数据中安全提取文字。
 */
function extractOpenAIText(responseData) {
  const content =
    responseData?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  /*
   * 兼容某些可能返回内容数组的情况。
   */
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') {
          return item;
        }

        return item?.text || '';
      })
      .join('')
      .trim();
  }

  return '';
}

/**
 * 请求 OpenAI 翻译。
 */
async function requestTranslation({
  userText,
  direction,
  previousResult,
  validationReason,
  attempt
}) {
  const directionInstruction =
    direction === 'zh_to_th'
      ? `
翻译方向：中文翻译成泰语。

必须把下面的全部内容完整翻译成泰语。
最终结果中不得包含任何中文汉字。
只输出泰语翻译结果。
`
      : `
翻译方向：泰语翻译成中文。

必须把下面的全部内容完整翻译成中文。
最终结果中不得包含任何泰文字母。
只输出中文翻译结果。
`;

  let correctionInstruction = '';

  if (attempt > 1) {
    correctionInstruction = `
上一次翻译不合格。

不合格原因：
${validationReason}

上一次错误结果：
${previousResult || '空内容'}

请重新从原文开始完整翻译。

不得复制上一次错误结果。
不得保留原文。
不得漏翻。
不得出现中文和泰语混合。
`;
  }

  const response = await openaiClient.post(
    '/chat/completions',
    {
      model: 'gpt-5-mini',

      reasoning_effort: 'minimal',

      max_completion_tokens: 1000,

      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `
${directionInstruction}

${correctionInstruction}

原文开始：
${userText}
原文结束。
`.trim()
        }
      ]
    }
  );

  return extractOpenAIText(response.data);
}

/**
 * 翻译并自动验证。
 *
 * 最多尝试 3 次。
 */
async function translateText(userText) {
  const direction = detectTranslationDirection(userText);

  /*
   * 没有中文或泰语时，不交给模型乱翻。
   */
  if (!direction) {
    return userText;
  }

  const maxAttempts = 3;

  let previousResult = '';
  let validationReason = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const translated = await requestTranslation({
      userText,
      direction,
      previousResult,
      validationReason,
      attempt
    });

    const validation = validateTranslation(
      userText,
      translated,
      direction
    );

    if (validation.valid) {
      console.log('翻译成功', {
        direction,
        attempt,
        inputLength: userText.length,
        outputLength: translated.length
      });

      return translated;
    }

    previousResult = translated;
    validationReason = validation.reason;

    console.warn('翻译验证失败，准备重试', {
      direction,
      attempt,
      reason: validation.reason,
      original: userText,
      translated
    });
  }

  throw new Error(
    `连续 ${maxAttempts} 次翻译验证失败：${validationReason}`
  );
}

/* =========================================================
   LINE 签名验证
========================================================= */

function verifyLineSignature(req) {
  const receivedSignature =
    req.headers['x-line-signature'];

  if (
    !receivedSignature ||
    !LINE_CHANNEL_SECRET ||
    !req.rawBody
  ) {
    return false;
  }

  const calculatedSignature = crypto
    .createHmac('sha256', LINE_CHANNEL_SECRET)
    .update(req.rawBody)
    .digest('base64');

  const receivedBuffer = Buffer.from(
    receivedSignature,
    'utf8'
  );

  const calculatedBuffer = Buffer.from(
    calculatedSignature,
    'utf8'
  );

  if (
    receivedBuffer.length !== calculatedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    receivedBuffer,
    calculatedBuffer
  );
}

/* =========================================================
   防止重复处理 LINE Webhook
========================================================= */

const processedEventIds = new Map();

const EVENT_CACHE_TIME = 10 * 60 * 1000;

/**
 * 清理超过 10 分钟的事件记录。
 */
function cleanProcessedEventIds() {
  const now = Date.now();

  for (const [eventId, timestamp] of processedEventIds) {
    if (now - timestamp > EVENT_CACHE_TIME) {
      processedEventIds.delete(eventId);
    }
  }
}

/**
 * 检查事件是否已处理。
 */
function isDuplicateEvent(event) {
  const eventId = event.webhookEventId;

  if (!eventId) {
    return false;
  }

  cleanProcessedEventIds();

  if (processedEventIds.has(eventId)) {
    return true;
  }

  processedEventIds.set(eventId, Date.now());

  return false;
}

/* =========================================================
   LINE 回复
========================================================= */

async function replyToLine(replyToken, text) {
  if (!replyToken) {
    throw new Error('缺少 LINE replyToken');
  }

  const finalText = String(text || '').trim();

  if (!finalText) {
    throw new Error('准备发送给 LINE 的文字为空');
  }

  await lineClient.post('/message/reply', {
    replyToken,

    messages: [
      {
        type: 'text',

        /*
         * LINE 单条文字消息做安全截断。
         */
        text: finalText.slice(0, 5000)
      }
    ]
  });
}

/* =========================================================
   处理单个 LINE 事件
========================================================= */

async function handleEvent(event) {
  if (!event) {
    return;
  }

  if (isDuplicateEvent(event)) {
    console.log('忽略重复事件', {
      webhookEventId: event.webhookEventId
    });

    return;
  }

  if (event.type !== 'message') {
    return;
  }

  if (event.message?.type !== 'text') {
    return;
  }

  const userText = event.message.text?.trim();

  if (!userText) {
    return;
  }

  if (!event.replyToken) {
    console.error('LINE 事件缺少 replyToken');

    return;
  }

  try {
    const translated = await translateText(userText);

    await replyToLine(
      event.replyToken,
      translated
    );
  } catch (error) {
    console.error('处理 LINE 消息失败', {
      message: error.message,
      status: error.response?.status,
      responseData: error.response?.data,
      originalText: userText
    });

    /*
     * 尝试给用户返回失败提醒。
     * 如果 replyToken 已经过期，这一步也可能失败。
     */
    try {
      await replyToLine(
        event.replyToken,
        '翻译暂时失败，请重新发送一次。'
      );
    } catch (replyError) {
      console.error('发送错误提示失败', {
        message: replyError.message,
        status: replyError.response?.status,
        responseData: replyError.response?.data
      });
    }
  }
}

/* =========================================================
   LINE Webhook
========================================================= */

app.post('/webhook', async (req, res) => {
  if (!verifyLineSignature(req)) {
    console.error('LINE 签名验证失败');

    return res.sendStatus(401);
  }

  const events = Array.isArray(req.body?.events)
    ? req.body.events
    : [];

  /*
   * 先向 LINE 返回 200，避免 LINE 因为等待时间过长而重复推送。
   */
  res.sendStatus(200);

  /*
   * 每条消息独立处理。
   * 一条消息失败不会影响其他消息。
   */
  const results = await Promise.allSettled(
    events.map(event => handleEvent(event))
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(
        `第 ${index + 1} 个事件处理失败`,
        result.reason
      );
    }
  });
});

/* =========================================================
   健康检查
========================================================= */

app.get('/', (req, res) => {
  res.status(200).send(
    'LINE Chinese-Thai Translator Bot Running'
  );
});

/* =========================================================
   启动服务器
========================================================= */

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(
    `LINE 翻译机器人已启动，端口：${PORT}`
  );
});
