import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';

const IP = '192.168.1.164';
const PASSWORD = 'Hawkdrive1997';
const URL = 'http://localhost:5173';

(async () => {
  console.log('Starting dev server...');
  const child = spawn('npm', ['run', 'dev'], { shell: true, stdio: 'pipe' });

  // Give dev server time to start
  await new Promise(r => setTimeout(r, 4000));

  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Set up dialog listener for the confirmation check
    let dialogMessage = '';
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      console.log('DIALOG INTERCEPTED: ', dialogMessage);
      await dialog.accept();
    });

    console.log('Navigating to', URL);
    await page.goto(URL);

    // 1. Connect Phase
    console.log('Connecting to Gateway...');
    await page.waitForSelector('input[name="ip"]');
    await page.evaluate(() => document.querySelector('input[name="ip"]').value = '');
    await page.type('input[name="ip"]', IP);
    await page.type('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');

    // Wait to reach dashboard (Home tab implies navigation to /home or UI shows Uptime)
    await page.waitForXPath("//span[contains(text(), 'Uptime')]", { timeout: 10000 });
    console.log('Connected!');

    // 2. Add Group Phase
    console.log('Switching to Profiles tab...');
    const profilesTab = await page.$x("//span[contains(text(), 'Profiles')]");
    await profilesTab[0].click();

    await page.waitForXPath("//button[contains(text(), 'Add Group')]", { timeout: 5000 });
    console.log('Adding new group...');
    const addGroupBtn = await page.$x("//button[contains(text(), 'Add Group')]");
    await addGroupBtn[0].click();

    console.log('Saving groups...');
    const saveBtn = await page.$x("//button[contains(text(), 'Save Changes')]");
    await saveBtn[0].click();
    await new Promise(r => setTimeout(r, 3000)); // wait for API propagation

    // Retrieve the amount of profiles right now
    const groups = await page.$x("//h3[contains(text(), 'New Group')]");
    console.log('Registered', groups.length, 'New Groups');

    // 3. Add Client Phase
    console.log('Switching to Clients tab...');
    const clientsTab = await page.$x("//span[contains(text(), 'Clients')]");
    await clientsTab[0].click();

    await page.waitForSelector('input[placeholder="00:11:22:33:44:55"]');
    console.log('Manually adding Test Client...');
    await page.type('input[placeholder="00:11:22:33:44:55"]', 'aa:bb:cc:11:22:33');
    await page.type('input[placeholder="Device Name"]', 'E2ETester');
    
    // We select the newest profile which is likely max index. We won't strictly map via DOM, we will just click Add Device.
    await page.click('button:has-text("Add Device")');
    await new Promise(r => setTimeout(r, 3000));

    // 4. Manual Block/Unblock Phase
    console.log('Blocking E2E Tester...');
    // In react table, we assume 'E2ETester' row has a block button
    const blockBtn = await page.$x("//td[contains(., 'E2ETester')]/..//button[contains(text(), 'Block') and not(contains(text(), 'Unblock'))]");
    if (blockBtn.length > 0) {
      await blockBtn[0].click();
      console.log('Clicked Block');
      await new Promise(r => setTimeout(r, 3000));
    }

    const unblockBtn = await page.$x("//td[contains(., 'E2ETester')]/..//button[contains(text(), 'Unblock')]");
    if (unblockBtn.length > 0) {
      await unblockBtn[0].click();
      console.log('Clicked Unblock');
      await new Promise(r => setTimeout(r, 3000));
    }

    // Assign client to the new profile
    console.log('Assigning Client to the newest Group...');
    // We will just evaluate setting the select element
    await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr'));
        const targetRow = rows.find(r => r.innerText.includes('E2ETester'));
        if (targetRow) {
            const select = targetRow.querySelector('select');
            const newGp = select.options[select.options.length - 1].value;
            select.value = newGp;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    await new Promise(r => setTimeout(r, 3000));

    // 5. Deleting Profile with mapped client Phase
    console.log('Switching to Profiles tab to test deletion warning...');
    await profilesTab[0].click();
    await new Promise(r => setTimeout(r, 2000));

    console.log('Deleting Group mapped to E2ETester...');
    const delBtns = await page.$x("//button[contains(text(), 'Remove Group') or contains(text(), 'Remove')]");
    await delBtns[delBtns.length - 1].click();
    
    await new Promise(r => setTimeout(r, 1000));

    if (dialogMessage.includes('WARNING: There are 1 device(s) mapped')) {
      console.log('SUCCESS: Deletion triggered the correct warning dialog showing mapped devices!');
    } else {
      console.log('FAILURE: Dialog did not show correct warning:', dialogMessage);
    }

    console.log('Saving groups after deletion...');
    const finalSaveBtn = await page.$x("//button[contains(text(), 'Save Changes')]");
    await finalSaveBtn[0].click();
    await new Promise(r => setTimeout(r, 3000));

    console.log('E2E TEST COMPLETE.');

  } catch (err) {
    console.error('Fatal Error during E2E test:', err);
  } finally {
    if (browser) await browser.close();
    child.kill();
    process.exit(0);
  }
})();
