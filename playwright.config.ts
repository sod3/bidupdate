import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir:"./e2e",timeout:45000,workers:1,
  reporter:[["list"],["json",{outputFile:"test-results/pool-results.json"}]],
  use:{baseURL:"http://127.0.0.1:3188",trace:"retain-on-failure"},
  webServer:{command:"npx next start --hostname 127.0.0.1 --port 3188",url:"http://127.0.0.1:3188/play/eight-ball",reuseExistingServer:false,timeout:120000},
  projects:[
    {name:"desktop",use:{...devices["Desktop Chrome"],viewport:{width:1920,height:1080}}},
    {name:"laptop",use:{...devices["Desktop Chrome"],viewport:{width:1366,height:768}}},
    {name:"tablet",use:{...devices["iPad Mini"],defaultBrowserType:"chromium"}},
    {name:"android",use:{...devices["Pixel 7"]}},
    {name:"iphone",use:{...devices["iPhone 13"],defaultBrowserType:"chromium"}},
    {name:"small-mobile",use:{...devices["iPhone SE"],defaultBrowserType:"chromium"}},
  ],
});
