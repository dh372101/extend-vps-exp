import puppeteer from 'puppeteer'
import { setTimeout } from 'node:timers/promises'

const args = ['--no-sandbox', '--disable-setuid-sandbox']
if (process.env.PROXY_SERVER) {
    const proxy_url = new URL(process.env.PROXY_SERVER)
    proxy_url.username = ''
    proxy_url.password = ''
    args.push(`--proxy-server=${proxy_url}`.replace(/\/$/, ''))
}

const browser = await puppeteer.launch({
    defaultViewport: { width: 1080, height: 1024 },
    args,
})
const [page] = await browser.pages()
const userAgent = await browser.userAgent()
await page.setUserAgent(userAgent.replace('Headless', ''))
const recorder = await page.screencast({ path: 'recording.webm' })

try {
    if (process.env.PROXY_SERVER) {
        const { username, password } = new URL(process.env.PROXY_SERVER)
        if (username && password) {
            await page.authenticate({ username, password })
        }
    }

    // 登录流程
    await page.goto('https://secure.xserver.ne.jp/xapanel/login/xvps/', { waitUntil: 'networkidle2' })
    await page.locator('#memberid').fill(process.env.EMAIL)
    await page.locator('#user_password').fill(process.env.PASSWORD)
    await page.locator('text=ログインする').click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })

    // 改进的页面导航和等待逻辑
    console.log('导航到详细页面...')
    await page.goto('https://secure.xserver.ne.jp/xapanel/xvps/server/detail?id=40090523/', { 
        waitUntil: 'networkidle0', // 更严格的等待条件
        timeout: 30000 // 增加超时时间
    })

    // 额外等待页面内容加载
    await setTimeout(3000)

    // 检查页面是否正确加载
    const bodyContent = await page.evaluate(() => {
        return {
            hasContent: document.body.innerText.trim().length > 0,
            bodyHTML: document.body.innerHTML.substring(0, 500), // 获取前500字符用于调试
            currentURL: window.location.href,
            title: document.title
        }
    })

    console.log('页面状态:', bodyContent)

    // 如果页面为空，尝试刷新
    if (!bodyContent.hasContent) {
        console.log('页面内容为空，尝试刷新...')
        await page.reload({ waitUntil: 'networkidle0' })
        await setTimeout(5000)
    }

    // 等待特定元素加载
    try {
        await page.waitForSelector('text=更新する', { timeout: 10000 })
        console.log('找到"更新する"按钮')
    } catch (error) {
        console.log('未找到"更新する"按钮，检查页面状态')
        
        // 截图用于调试
        await page.screenshot({ path: 'debug_screenshot.png', fullPage: true })
        
        // 输出页面内容用于调试
        const pageContent = await page.content()
        console.log('页面HTML长度:', pageContent.length)
        console.log('页面URL:', await page.url())
        
        throw new Error('页面未正确加载')
    }

    // 继续执行后续操作
    await page.locator('text=更新する').click()
    await page.locator('text=引き続き無料VPSの利用を継続する').click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    
    const body = await page.$eval('img[src^="data:"]', img => img.src)
    const code = await fetch('https://captcha-120546510085.asia-northeast1.run.app', { 
        method: 'POST', 
        body 
    }).then(r => r.text())
    
    await page.locator('[placeholder="上の画像の数字を入力"]').fill(code)
    await page.locator('text=無料VPSの利用を継続する').click()

} catch (e) {
    console.error('错误详情:', e)
    // 发生错误时也截图
    await page.screenshot({ path: 'error_screenshot.png', fullPage: true })
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
}
