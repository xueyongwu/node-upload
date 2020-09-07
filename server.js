const express = require('express')
const multiparty = require("multiparty")
const path = require("path")
const fse = require("fs-extra")
const bodyParser = require("body-parser")

const app = express()
const port = 8888
// 上传文件目录
const UPLOAD_DIR = path.resolve(__dirname, ".", "database")
// 使用body-parser中间件，就可以在路由处理器的req.body中访问请求参数
const urlencodedParser = bodyParser.urlencoded({ extended: true })

// 解决跨域问题
app.all('*', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization, Accept, X-Requested-With')
  res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})

// 校验上传文件是否存在
app.post('/verify', urlencodedParser, async (req, res) => {
  const { fileHash, fileName } = req.body
  const filePath = `${UPLOAD_DIR}/${fileName}`
  let resData = {}

  if (fse.existsSync(filePath)) {
    resData = {
      uploaded: true
    }
  } else {
    const chunkDir = `${UPLOAD_DIR}/${fileHash}`
    let chunkPaths = []

    if (fse.existsSync(chunkDir)) {
      chunkPaths = await fse.readdir(chunkDir)
    }
    resData = {
      uploaded: false,
      uploaded_chunks: chunkPaths
    }
  }
  res.end(JSON.stringify(resData))
})

// 上传分片文件
app.post('/upload', (req, res) => {
  const multipart = new multiparty.Form()

  multipart.parse(req, async (error, fields, file) => {
    if (error) return

    const [chunk] = file.chunk
    const [hash] = fields.hash
    const [fileHash] = fields.fileHash
    const chunkDir = `${UPLOAD_DIR}/${fileHash}`
    // 创建切片目录
    if (!fse.existsSync(chunkDir)) {
      await fse.mkdirs(chunkDir)
    }
    // 将切片从临时存储路径移动到切片目录下
    const chunkPath = `${chunkDir}/${hash}`
    if (!fse.existsSync(chunkPath)) {
      await fse.move(chunk.path, chunkPath)
    }

    res.end("received file chunk")
  })
})

// 合并分片文件
app.post('/merge', urlencodedParser, async (req, res) => {
  try {
    const { fileName, fileHash } = req.body
    const chunkDir = `${UPLOAD_DIR}/${fileHash}`
    // 将分片目录路径作为合并后文件路径
    const mergeFilePath = `${UPLOAD_DIR}/${fileName}`

    // 创建一个空文件
    await fse.writeFile(mergeFilePath, "")
    const chunkPaths = await fse.readdir(chunkDir)
    // 遍历合并分片文件
    chunkPaths.forEach(chunkPath => {
      const path = `${chunkDir}/${chunkPath}`
      fse.appendFileSync(mergeFilePath, fse.readFileSync(path))
      // 删除切片文件
      fse.unlinkSync(path)
    })
    // 合并后删除保存切片的目录
    fse.rmdirSync(chunkDir)

    res.end(JSON.stringify({
      code: 0,
      message: "file merged success"
    }))
  } catch (err) {
    console.error(err)
    res.sendStatus(406).end(JSON.stringify({
      code: 'error',
      message: "file merged fail"
    }))
  }

})

app.listen(port, () => console.log(`server listening on port ${port}`))
