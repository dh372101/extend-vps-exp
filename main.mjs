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
    console.log('开始登录...')
    await page.goto('https://secure.xserver.ne.jp/xapanel/login/xvps/', { waitUntil: 'networkidle2' })
    await page.locator('#memberid').fill(process.env.EMAIL)
    await page.locator('#user_password').fill(process.env.PASSWORD)
    await page.locator('text=ログインする').click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    console.log('登录完成')

    // 导航到详细页面
    console.log('导航到详细页面...')
    await page.goto('https://secure.xserver.ne.jp/xapanel/xvps/server/detail?id=40090523/', { 
        waitUntil: 'networkidle0',
        timeout: 30000
    })

    // 等待并点击"更新する"按钮
    console.log('等待"更新する"按钮...')
    await page.waitForSelector('text=更新する', { timeout: 10000 })
    console.log('找到"更新する"按钮，准备点击')
    
    // 截图保存当前状态
    await page.screenshot({ path: 'before_update_click.png', fullPage: true })
    
    await page.locator('text=更新する').click()
    console.log('已点击"更新する"按钮')

    // 等待页面响应
    await setTimeout(3000)
    
    // 截图查看点击后的状态
    await page.screenshot({ path: 'after_update_click.png', fullPage: true })
    
    // 检查是否有"引き続き無料VPSの利用を継続する"按钮
    console.log('查找"引き続き無料VPSの利用を継続する"按钮...')
    try {
        await page.waitForSelector('text=引き続き無料VPSの利用を継続する', { timeout: 15000 })
        console.log('找到"引き続き無料VPSの利用を継続する"按钮')
        
        await page.locator('text=引き続き無料VPSの利用を継続する').click()
        console.log('已点击"引き続き無料VPSの利用を継続する"按钮')
        
    } catch (error) {
        console.log('未找到"引き続き無料VPSの利用を継続する"按钮，检查页面内容...')
        
        // 获取当前页面的所有文本内容
        const pageText = await page.evaluate(() => document.body.innerText)
        console.log('当前页面文本内容:', pageText.substring(0, 1000)) // 显示前1000字符
        
        // 查找所有按钮和链接
        const buttons = await page.evaluate(() => {
            const elements = [...document.querySelectorAll('button, a, input[type="submit"]')]
            return elements.map(el => ({
                tagName: el.tagName,
                text: el.innerText?.trim() || el.value,
                className: el.className,
                id: el.id
            })).filter(el => el.text)
        })
        console.log('页面中的按钮和链接:', buttons)
        
        throw error
    }

    // 等待导航完成
    console.log('等待页面导航...')
    try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
        console.log('页面导航完成')
    } catch (navError) {
        console.log('导航等待超时，但继续执行...')
    }

    // 额外等待
    await setTimeout(3000)
    
    // 截图查看当前状态
    await page.screenshot({ path: 'after_continue_click.png', fullPage: true })

    // 查找验证码图片
    console.log('查找验证码图片...')
    try {
        await page.waitForSelector('img[src^="data:"]', { timeout: 10000 })
        console.log('找到验证码图片')
        
        const body = await page.$eval('img[src^="data:"]', img => img.src)
        console.log('获取验证码图片数据')
        
        const code = await fetch('https://captcha-120546510085.asia-northeast1.run.app', { 
            method: 'POST', 
            body 
        }).then(r => r.text())
        console.log('验证码识别结果:', code)
        
        await page.locator('[placeholder="上の画像の数字を入力"]').fill(code)
        console.log('已填入验证码')
        
        await page.locator('text=無料VPSの利用を継続する').click()
        console.log('已点击"無料VPSの利用を継続する"按钮')
        
    } catch (captchaError) {
        console.log('验证码处理出错:', captchaError.message)
        
        // 检查当前页面状态
        const currentURL = await page.url()
        const pageTitle = await page.title()
        console.log('当前URL:', currentURL)
        console.log('当前页面标题:', pageTitle)
        
        // 查找页面中的所有图片
        const images = await page.evaluate(() => {
            const imgs = [...document.querySelectorAll('img')]
            return imgs.map(img => ({
                src: img.src?.substring(0, 100), // 只显示前100字符
                alt: img.alt,
                className: img.className
            }))
        })
        console.log('页面中的图片:', images)
        
        throw captchaError
    }

} catch (e) {
    console.error('错误详情:', e)
    await page.screenshot({ path: 'error_screenshot.png', fullPage: true })
    
    // 输出最终页面状态
    const finalURL = await page.url()
    const finalTitle = await page.title()
    console.log('最终URL:', finalURL)
    console.log('最终页面标题:', finalTitle)
    
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
}
