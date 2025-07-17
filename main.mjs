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
    
    // 等待页面加载完成
    console.log('等待页面加载完成...')
    await setTimeout(3000) // 使用Node.js的setTimeout
    
    // 检查页面内容
    console.log('当前页面标题:', await page.title())
    console.log('当前页面URL:', page.url())
    
    // 获取页面上所有可点击元素的文本
    const clickableElements = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a'))
        return elements.map(el => ({
            tagName: el.tagName,
            text: el.textContent?.trim() || el.value || '',
            className: el.className,
            id: el.id,
            href: el.href || ''
        })).filter(el => el.text)
    })
    
    console.log('页面上所有可点击元素:')
    clickableElements.forEach((el, index) => {
        console.log(`[${index}] ${el.tagName}: "${el.text}" (class: ${el.className}, id: ${el.id})`)
    })
    
    // 检查是否存在包含"更新"的元素
    const updateElements = clickableElements.filter(el => 
        el.text.includes('更新') || el.text.includes('update')
    )
    
    if (updateElements.length === 0) {
        console.log('未找到包含"更新"的按钮，尝试查找其他相关按钮...')
        // 查找可能的相关按钮
        const relatedElements = clickableElements.filter(el => 
            el.text.includes('継続') || el.text.includes('延長') || el.text.includes('更新')
        )
        console.log('相关按钮:', relatedElements)
        
        if (relatedElements.length === 0) {
            // 保存页面HTML以供调试
            const html = await page.content()
            console.log('页面HTML长度:', html.length)
            
            throw new Error('未找到任何相关的按钮')
        }
    } else {
        console.log('找到的更新相关按钮:', updateElements)
    }
    
    // 尝试多种方法来点击"更新する"按钮
    let clickSuccess = false
    
    // 方法1: 使用locator (原始方法)
    try {
        console.log('方法1: 尝试使用 locator...')
        const updateBtn = page.locator('text=更新する')
        await updateBtn.click({ timeout: 10000 })
        clickSuccess = true
        console.log('成功使用locator点击更新按钮')
    } catch (e) {
        console.log('方法1失败:', e.message)
    }
    
    // 方法2: 使用传统的page.click方法
    if (!clickSuccess) {
        try {
            console.log('方法2: 尝试使用传统click方法...')
            await page.click('button:contains("更新する"), input[value*="更新"], a:contains("更新する")')
            clickSuccess = true
            console.log('成功使用传统click方法')
        } catch (e) {
            console.log('方法2失败:', e.message)
        }
    }
    
    // 方法3: 使用XPath
    if (!clickSuccess) {
        try {
            console.log('方法3: 尝试使用XPath...')
            const xpath = '//button[contains(text(), "更新")] | //input[contains(@value, "更新")] | //a[contains(text(), "更新")]'
            const [button] = await page.$x(xpath)
            if (button) {
                await button.click()
                clickSuccess = true
                console.log('成功使用XPath点击更新按钮')
            } else {
                console.log('XPath未找到匹配元素')
            }
        } catch (e) {
            console.log('方法3失败:', e.message)
        }
    }
    
    // 方法4: 直接在页面中执行点击
    if (!clickSuccess) {
        try {
            console.log('方法4: 尝试直接执行点击...')
            const clicked = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('button, input, a'))
                const updateBtn = elements.find(el => 
                    (el.textContent && el.textContent.includes('更新')) ||
                    (el.value && el.value.includes('更新'))
                )
                if (updateBtn) {
                    updateBtn.click()
                    return true
                }
                return false
            })
            
            if (clicked) {
                clickSuccess = true
                console.log('成功使用evaluate方法点击更新按钮')
            }
        } catch (e) {
            console.log('方法4失败:', e.message)
        }
    }
    
    if (!clickSuccess) {
        throw new Error('所有点击方法都失败了')
    }
    
    // 等待页面响应
    await setTimeout(2000)
    
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
