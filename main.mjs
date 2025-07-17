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
    
    // 使用 Puppeteer 的正确等待方法
    console.log('等待页面加载完成...')
    await page.waitForLoadState ? page.waitForLoadState('networkidle') : page.waitForTimeout(3000)
    
    // 或者直接使用 waitForTimeout 和 waitForSelector
    await page.waitForTimeout(3000) // 等待3秒
    
    // 检查页面内容
    console.log('当前页面标题:', await page.title())
    
    // 尝试找到"更新する"按钮 - 使用 Puppeteer 的方法
    try {
        await page.waitForSelector('*', { timeout: 5000 }) // 确保页面有内容
        
        // 获取页面上所有可点击元素的文本
        const clickableElements = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a'))
            return elements.map(el => ({
                tagName: el.tagName,
                text: el.textContent?.trim() || el.value || '',
                className: el.className,
                id: el.id
            })).filter(el => el.text)
        })
        
        console.log('页面上所有可点击元素:')
        clickableElements.forEach(el => {
            console.log(`- ${el.tagName}: "${el.text}" (class: ${el.className}, id: ${el.id})`)
        })
        
        // 检查是否存在包含"更新"的元素
        const updateElement = clickableElements.find(el => el.text.includes('更新'))
        if (!updateElement) {
            throw new Error('未找到包含"更新"的按钮')
        }
        
        console.log('找到更新按钮:', updateElement)
        
    } catch (checkError) {
        console.error('检查页面元素时出错:', checkError)
    }
    
    // 尝试多种选择器来点击"更新する"按钮
    let clickSuccess = false
    const updateSelectors = [
        'text=更新する',
        'button:contains("更新")',
        'input[value*="更新"]',
        'a:contains("更新")',
        '*:contains("更新する")'
    ]
    
    for (const selector of updateSelectors) {
        try {
            console.log(`尝试使用选择器: ${selector}`)
            await page.locator(selector).click({ timeout: 10000 })
            clickSuccess = true
            console.log('成功点击更新按钮')
            break
        } catch (e) {
            console.log(`选择器 ${selector} 失败:`, e.message)
        }
    }
    
    if (!clickSuccess) {
        // 如果所有选择器都失败，尝试使用 evaluate 直接点击
        try {
            await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('*'))
                const updateBtn = elements.find(el => 
                    el.textContent && el.textContent.includes('更新') && 
                    (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT')
                )
                if (updateBtn) {
                    updateBtn.click()
                    return true
                }
                return false
            })
            console.log('使用 evaluate 方法点击更新按钮')
        } catch (e) {
            throw new Error('无法找到或点击更新按钮')
        }
    }
    
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
    try {
        await page.screenshot({ path: 'error-screenshot.png', fullPage: true })
        console.log('错误截图已保存到 error-screenshot.png')
    } catch (screenshotError) {
        console.error('截图失败:', screenshotError)
    }
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
}
