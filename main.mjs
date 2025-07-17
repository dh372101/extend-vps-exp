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

    console.log('正在访问登录页面...')
    await page.goto('https://secure.xserver.ne.jp/xapanel/login/xvps/', { waitUntil: 'networkidle2' })
    
    console.log('正在填写登录信息...')
    await page.locator('#memberid').fill(process.env.EMAIL)
    await page.locator('#user_password').fill(process.env.PASSWORD)
    await page.locator('text=ログインする').click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    
    console.log('正在点击服务器详情链接...')
    await page.locator('a[href^="/xapanel/xvps/server/detail?id="]').click()
    
    // 增加等待和调试
    console.log('等待页面加载完成...')
    await page.waitForLoadState('networkidle')
    
    // 检查页面内容
    const pageContent = await page.content()
    console.log('当前页面标题:', await page.title())
    
    // 尝试找到"更新する"按钮
    const updateButtons = await page.$$('*:has-text("更新する")')
    console.log('找到的"更新する"按钮数量:', updateButtons.length)
    
    if (updateButtons.length === 0) {
        // 如果没找到，尝试其他可能的选择器
        const allButtons = await page.$$('button, input[type="submit"], a')
        console.log('页面上所有按钮/链接的文本:')
        for (const button of allButtons) {
            const text = await button.textContent()
            if (text && text.trim()) {
                console.log('-', text.trim())
            }
        }
        throw new Error('未找到"更新する"按钮')
    }
    
    // 使用更具体的选择器或者增加超时时间
    await page.locator('text=更新する').click({ timeout: 60000 })
    
    console.log('正在点击继续使用免费VPS...')
    await page.locator('text=引き続き無料VPSの利用を継続する').click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    
    console.log('正在处理验证码...')
    const body = await page.$eval('img[src^="data:"]', img => img.src)
    const code = await fetch('https://captcha-120546510085.asia-northeast1.run.app', { method: 'POST', body }).then(r => r.text())
    await page.locator('[placeholder="上の画像の数字を入力"]').fill(code)
    await page.locator('text=無料VPSの利用を継続する').click()
    
    console.log('操作完成')
} catch (e) {
    console.error('发生错误:', e)
    // 截图保存错误状态
    await page.screenshot({ path: 'error-screenshot.png' })
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
}
