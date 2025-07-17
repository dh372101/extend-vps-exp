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

    // 等待页面完全加载
    await setTimeout(3000)

    // 使用指定的XPath查找更新按钮
    console.log('使用XPath查找更新按钮...')
    const updateButtonXPath = '/html/body/main/div/section[1]/table/tbody/tr[8]/td/div/a'
    
    try {
        // 等待XPath元素出现
        await page.waitForXPath(updateButtonXPath, { timeout: 10000 })
        console.log('找到更新按钮')
        
        // 获取元素
        const [updateButton] = await page.$x(updateButtonXPath)
        
        if (updateButton) {
            // 检查元素信息
            const buttonInfo = await page.evaluate(el => ({
                text: el.innerText?.trim(),
                href: el.href,
                className: el.className,
                isVisible: el.offsetParent !== null,
                rect: el.getBoundingClientRect()
            }), updateButton)
            
            console.log('按钮信息:', buttonInfo)
            
            // 滚动到按钮位置
            await updateButton.scrollIntoView({ behavior: 'smooth', block: 'center' })
            await setTimeout(1000)
            
            // 截图显示按钮位置
            await page.screenshot({ path: 'before_update_click.png', fullPage: true })
            
            // 点击按钮
            await updateButton.click()
            console.log('成功点击更新按钮')
            
        } else {
            throw new Error('XPath未找到对应元素')
        }
        
    } catch (error) {
        console.log('使用XPath查找按钮失败:', error.message)
        
        // 备用方案：输出表格结构用于调试
        const tableInfo = await page.evaluate(() => {
            const table = document.querySelector('main div section table tbody')
            if (table) {
                const rows = [...table.querySelectorAll('tr')]
                return rows.map((row, index) => ({
                    rowIndex: index + 1,
                    cells: [...row.querySelectorAll('td')].map((cell, cellIndex) => ({
                        cellIndex: cellIndex + 1,
                        text: cell.innerText?.trim().substring(0, 100),
                        hasLink: cell.querySelector('a') ? true : false,
                        linkText: cell.querySelector('a')?.innerText?.trim()
                    }))
                }))
            }
            return null
        })
        
        console.log('表格结构:', JSON.stringify(tableInfo, null, 2))
        throw error
    }

    // 等待点击后的响应
    console.log('等待点击响应...')
    await setTimeout(5000)
    
    // 截图查看点击后的状态
    await page.screenshot({ path: 'after_update_click.png', fullPage: true })
    
    // 检查页面变化
    const currentURL = await page.url()
    console.log('点击后的URL:', currentURL)

    // 查找"引き続き無料VPSの利用を継続する"按钮
    console.log('查找"引き続き無料VPSの利用を継続する"按钮...')
    
    try {
        // 等待继续使用相关内容出现
        await page.waitForFunction(
            () => document.body.innerText.includes('引き続き無料VPSの利用を継続する'),
            { timeout: 15000 }
        )
        console.log('找到继续使用相关内容')
        
        // 查找并点击继续使用按钮
        const continueButtons = await page.$x('//button[contains(text(), "引き続き無料VPSの利用を継続する")] | //input[contains(@value, "引き続き無料VPSの利用を継続する")] | //a[contains(text(), "引き続き無料VPSの利用を継続する")]')
        
        if (continueButtons.length > 0) {
            await continueButtons[0].scrollIntoView()
            await setTimeout(1000)
            await continueButtons[0].click()
            console.log('成功点击"引き続き無料VPSの利用を継続する"按钮')
        } else {
            // 使用JavaScript方式点击
            await page.evaluate(() => {
                const elements = [...document.querySelectorAll('*')]
                const continueElement = elements.find(el => 
                    el.innerText && el.innerText.includes('引き続き無料VPSの利用を継続する')
                )
                if (continueElement) {
                    continueElement.scrollIntoView()
                    continueElement.click()
                }
            })
            console.log('使用JavaScript点击继续按钮')
        }
        
    } catch (error) {
        console.log('未找到继续使用按钮:', error.message)
        
        // 输出当前页面内容用于调试
        const pageText = await page.evaluate(() => document.body.innerText)
        console.log('当前页面文本片段:', pageText.substring(0, 1000))
    }

    // 等待导航完成
    console.log('等待页面导航...')
    await setTimeout(5000)
    
    // 截图查看继续点击后的状态
    await page.screenshot({ path: 'after_continue_click.png', fullPage: true })

    // 处理验证码
    console.log('查找验证码图片...')
    try {
        await page.waitForSelector('img[src^="data:"]', { timeout: 10000 })
        console.log('找到验证码图片')
        
        const body = await page.$eval('img[src^="data:"]', img => img.src)
        const code = await fetch('https://captcha-120546510085.asia-northeast1.run.app', { 
            method: 'POST', 
            body 
        }).then(r => r.text())
        
        console.log('验证码识别结果:', code)
        
        await page.locator('[placeholder="上の画像の数字を入力"]').fill(code)
        await page.locator('text=無料VPSの利用を継続する').click()
        console.log('验证码处理完成')
        
    } catch (error) {
        console.log('验证码处理失败:', error.message)
        
        // 检查当前页面状态
        const finalURL = await page.url()
        const finalTitle = await page.title()
        console.log('最终URL:', finalURL)
        console.log('最终页面标题:', finalTitle)
    }

} catch (e) {
    console.error('错误详情:', e)
    await page.screenshot({ path: 'error_screenshot.png', fullPage: true })
    
    // 输出最终页面状态
    try {
        const finalURL = await page.url()
        const finalTitle = await page.title()
        console.log('出错时URL:', finalURL)
        console.log('出错时页面标题:', finalTitle)
    } catch (finalError) {
        console.log('无法获取最终页面状态')
    }
    
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
}
