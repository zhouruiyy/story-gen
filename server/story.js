const fetch = require('node-fetch')

const STORY_TYPES = {
  adventure: '冒险探索',
  friendship: '友谊关爱',
  science: '科普认知',
  warm: '温馨治愈'
}

const LENGTH_MAP = {
  short: { words: 400, minutes: '3' },
  medium: { words: 700, minutes: '5' }
}

function buildPrompt({ name, keywords, type, length }) {
  const storyType = STORY_TYPES[type] || '温馨治愈'
  const { words } = LENGTH_MAP[length] || LENGTH_MAP.medium
  const heroName = (name && name.trim()) || '小朋友'
  const keywordStr = Array.isArray(keywords) ? keywords.join('、') : keywords

  return `你是一位深受孩子喜爱的中文儿童故事作家，擅长用"讲"的方式写故事，让听故事的小朋友身临其境。

请根据以下信息创作一个睡前故事：
- 主角名字：${heroName}
- 关键词/主题：${keywordStr}
- 故事类型：${storyType}
- 故事长度：约${words}字

写作要求（非常重要，请严格遵守）：
1. 【对话格式——最重要！】这个故事会被语音朗读给孩子听。所有对话必须用叙事体写，把"谁说的"和"怎么说的"融进句子里，绝对不能用剧本格式。
   ✗ 错误：小兔子："我的糖果不见了！"
   ✗ 错误：小兔子说："我的糖果不见了！"（太干巴）
   ✓ 正确：小兔子急得跺跺脚，大声喊："我的糖果不见了！"
   ✓ 正确："我的糖果不见了！"小兔子翻遍了所有口袋，急得快要哭了。
   每句对话都要搭配一个小动作或表情，让听的人能"看见"画面。
2. 【多对话、少描写】故事至少一半以上是角色对话。用对话推动情节，不要用大段旁白描述场景。
3. 【故事性强】要有清晰的"问题→尝试→解决"主线。主角遇到一个具体的小问题或小任务，经历2-3次尝试或遭遇，最终解决。每一步都要有事情发生，不要停下来描写风景。
4. 【角色鲜活】给每个角色独特的说话方式或口头禅，让孩子能记住角色。
5. 【节奏感和重复】适当使用重复句式（如三次尝试、反复出现的台词），幼儿喜欢可预测的节奏，会跟着一起说。
6. 【语言口语化】像在跟孩子面对面讲故事。句子要短，多用动词，少用形容词。
7. 【温馨收尾】结尾温暖安宁，适合睡前，自然融入一个小道理但不要说教。最后一两句引导入睡。
8. 可以融入中国文化元素（十二生肖、传统节日、神话角色等）。
9. 请给故事起一个可爱的标题。

下面是一段示范，请模仿这个风格和对话写法：
"小兔子一打开门，就看见门口放着一个红色的小盒子。
'咦？这是谁送来的呀？'小兔子歪着脑袋，挠了挠长耳朵。
它把盒子翻过来、转过去，又凑到耳朵边摇了摇——咚咚咚，里面好像有什么东西在动！
'我得去找小熊帮忙！'小兔子抱起盒子就往外跑。
小熊正坐在树桩上吃蜂蜜，看见小兔子跑过来，赶紧把蜂蜜罐藏到身后：'你可别想打我蜂蜜的主意哦！'
'才不是呢！'小兔子把盒子举到小熊面前，'你听你听，里面有东西在动！'
小熊把耳朵贴上去，眼睛一下子瞪得圆圆的：'真的诶！要不……我们打开看看？'"

输出格式（严格遵守）：
标题：xxx

正文内容...`
}

async function generateStory(params, onChunk) {
  const apiKey = process.env.LLM_API_KEY
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com'
  const model = process.env.LLM_MODEL || 'deepseek-chat'

  if (!apiKey) {
    throw new Error('未配置 LLM_API_KEY，请在 .env 文件中设置')
  }

  const prompt = buildPrompt(params)

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      temperature: 0.9,
      max_tokens: 2000
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`LLM API 错误 (${response.status}): ${err}`)
  }

  return new Promise((resolve, reject) => {
    let buffer = ''

    response.body.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          resolve()
          return
        }

        try {
          const json = JSON.parse(data)
          const content = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content
          if (content) onChunk(content)
        } catch (e) {
          // skip malformed JSON
        }
      }
    })

    response.body.on('end', () => resolve())
    response.body.on('error', (err) => reject(err))
  })
}

module.exports = { generateStory }
