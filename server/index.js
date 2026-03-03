const express = require('express')
const cors = require('cors')
const path = require('path')
const { config } = require('dotenv')
const { generateStory } = require('./story.js')
const WebSocket = require('ws')
const { v4: uuidv4 } = require('uuid')

config()

const app = express()
const PORT = process.env.PORT || 3002

app.use(cors())
app.use(express.json())

// 生产模式：托管前端构建产物
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))

// 音色映射
const VOICE_MAP = {
  'longxiaochun_v3': 'longxiaochun_v3',
  'longyuan_v3': 'longyuan_v3',
  'longanyang': 'longanyang',
}

// 流式 TTS
function streamTTS(text, voice, res) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.LLM_API_KEY
    const wsUrl = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/'
    const taskId = uuidv4()

    const ws = new WebSocket(wsUrl, {
      headers: { 'Authorization': 'bearer ' + apiKey }
    })

    ws.on('open', () => {
      ws.send(JSON.stringify({
        header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
        payload: {
          task_group: 'audio', task: 'tts', function: 'SpeechSynthesizer',
          model: 'cosyvoice-v3-flash',
          parameters: {
            text_type: 'PlainText', voice: voice, format: 'mp3',
            sample_rate: 22050, volume: 50, rate: 0.9, pitch: 1
          },
          input: {}
        }
      }))
    })

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        res.write(data)
        return
      }

      const msg = JSON.parse(data.toString())
      const event = msg.header && msg.header.event

      if (event === 'task-started') {
        ws.send(JSON.stringify({
          header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' },
          payload: { input: { text: text } }
        }))
        ws.send(JSON.stringify({
          header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
          payload: { input: {} }
        }))
      } else if (event === 'task-finished') {
        ws.close()
        res.end()
        resolve()
      } else if (event === 'task-failed') {
        ws.close()
        reject(new Error((msg.header && msg.header.error_message) || '语音合成失败'))
      }
    })

    ws.on('error', (err) => reject(new Error('WebSocket 连接失败: ' + err.message)))

    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
        reject(new Error('语音合成超时'))
      }
    }, 120000)
  })
}

// 故事生成接口
app.post('/api/generate-story', async (req, res) => {
  const { name, keywords, type, length } = req.body
  if (!keywords || keywords.length === 0) {
    return res.status(400).json({ error: '请至少提供一个关键词' })
  }
  try {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    await generateStory({ name, keywords, type, length }, (chunk) => {
      res.write('data: ' + JSON.stringify({ content: chunk }) + '\n\n')
    })
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('故事生成失败:', err.message)
    if (!res.headersSent) {
      res.status(500).json({ error: '故事生成失败，请稍后再试' })
    } else {
      res.write('data: ' + JSON.stringify({ error: '生成中断' }) + '\n\n')
      res.end()
    }
  }
})

// 流式 TTS 接口
app.post('/api/tts', async (req, res) => {
  const { text, voice } = req.body
  if (!text) return res.status(400).json({ error: '缺少文本内容' })

  const selectedVoice = VOICE_MAP[voice] || 'longxiaochun_v3'
  console.log('[TTS] 流式合成，音色: ' + selectedVoice + '，文本长度: ' + text.length)

  res.setHeader('Content-Type', 'audio/mpeg')
  res.setHeader('Transfer-Encoding', 'chunked')
  res.setHeader('Cache-Control', 'no-cache')

  try {
    await streamTTS(text, selectedVoice, res)
    console.log('[TTS] 流式合成完成')
  } catch (err) {
    console.error('[TTS] 合成失败:', err.message)
    if (!res.headersSent) {
      res.status(500).json({ error: '语音合成失败: ' + err.message })
    } else {
      res.end()
    }
  }
})

// 所有非 API 路由都返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log('🌙 故事星球已启动: http://localhost:' + PORT)
})
