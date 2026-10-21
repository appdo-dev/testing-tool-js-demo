# Tài liệu & DEMO: Tích Hợp GitHub Actions (`testing-tool-js` ↔ `qa-analyzer` — Project `ES`)

Thư mục này chứa toàn bộ tài liệu kiến trúc, cấu hình, script chạy thử và bộ hình ảnh / video màn hình thực tế cho luồng CI/CD **GitHub Actions** giữa repository `testing-tool-js` (đã triển khai demo tại [`danhhoangjunior/testing-tool-js-demo`](https://github.com/danhhoangjunior/testing-tool-js-demo) & [`danhjunior/testing-tool-js-demo`](https://github.com/danhjunior/testing-tool-js-demo)) và ứng dụng Jira Cloud `qa-analyzer` (`https://pipevo.atlassian.net/jira/software/projects/ES/...`, project key **`ES`**).

## Cấu trúc thư mục `docs/github-actions/`

| File / Thư mục | Mô tả |
| :--- | :--- |
| [`README.md`](./README.md) | Tài liệu phân tích luồng hoạt động, hướng dẫn cài đặt & hình ảnh DEMO thực tế từng bước |
| [`.env.example`](./.env.example) | Mẫu cấu hình `.env` để đẩy kết quả từ local lên Forge Web Trigger của project `ES` |
| [`demo-github-actions.sh`](./demo-github-actions.sh) | Script chạy Demo thực tế (`sh docs/github-actions/demo-github-actions.sh`) |
| [`media/demo_github_actions_flow.mp4`](./media/demo_github_actions_flow.mp4) | Video ghi màn hình toàn trình 6 bước (MP4) |
| [`media/demo_step1_jira_setup.png`](./media/demo_step1_jira_setup.png) | Ảnh Bước 1: Màn hình CI/CD Pipeline → GitHub Actions → Setup trên Jira (`ES`) |
| [`media/demo_step2_github_secrets.png`](./media/demo_step2_github_secrets.png) | Ảnh Bước 2: Cấu hình thực tế GitHub Secrets (`URL`, `TOKEN`) & Variable (`JIRA_PROJECT_KEY=ES`) |
| [`media/demo_step3_github_actions_run.png`](./media/demo_step3_github_actions_run.png) | Ảnh Bước 3: GitHub Actions Cloud Runner thực thi job `test` (`AiTestingTool Vitest #2`) và nhận `HTTP 201` |
| [`media/demo_step4_terminal_execution.png`](./media/demo_step4_terminal_execution.png) | Ảnh Bước 4: Kết quả thực thi script Demo trên Terminal |
| [`media/demo_step5_jira_builds_sync.png`](./media/demo_step5_jira_builds_sync.png) | Ảnh Bước 5: Màn hình Jira `Empty Space (ES)` → `Test design` với các Suites & Automated TestCases (`ES-1024..ES-1057`) |
| [`media/demo_jira_test_execution.png`](./media/demo_jira_test_execution.png) | Ảnh Bước 6: Màn hình Jira `Empty Space (ES)` → `Test execution` với các bản ghi `Automated` `PASSED` (`ES-1071..ES-1076`) |

---

## 1. Sơ đồ luồng hoạt động End-to-End

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer / QA
    participant JiraUI as Jira Cloud (qa-analyzer UI)<br/>Project ES - CI/CD Pipeline
    participant GH as GitHub Actions<br/>(.github/workflows/ai-testing-tool-vitest.yml)
    participant Vitest as Vitest + @ai-testing-tool/forge-vitest<br/>(testing-tool-js)
    participant CLI as @ai-testing-tool/forge-api-client<br/>(CLI Uploader)
    participant ForgeIngest as Forge Web Trigger<br/>(qa-analyzer/src/app/api/ingest.ts)
    participant SyncWorker as Forge Async Queue / Scheduled Worker<br/>(launch-sync.ts)

    Dev->>JiraUI: 1. Mở Apps → GitHub Actions → Setup (chọn Vitest)
    JiraUI-->>Dev: Sinh mẫu .github/workflows/ai-testing-tool-vitest.yml<br/>+ Ingest URL + Ingest Token + JIRA_PROJECT_KEY=ES
    Dev->>GH: 2. Cài Secrets/Variables & Push code lên nhánh main / PR

    GH->>GH: 3. npm ci (tự động chạy prepare: npm run build)
    GH->>Vitest: 4. npx vitest run --reporter=json --outputFile=ai-testing-tool-results.json
    Note over Vitest: Plugin ai-testing-tool-cli-bridge kích hoạt<br/>@ai-testing-tool/forge-vitest xuất báo cáo FR41
    Vitest-->>GH: Xuất ai-testing-tool-results.json (FR41)<br/>kèm meta.qa (issueKeys, suite, steps, host)

    GH->>CLI: 5. npx @ai-testing-tool/forge-api-client<br/>--project "ES" --launch "AiTestingTool Vitest #2" --report ai-testing-tool-results.json
    Note over CLI: • detectCiEnvironment(): ciPlatform="github", ciBuildUrl, gitCommitSha...<br/>• remapReportIssueKeyPrefix(): chuẩn hóa issueKeys sang ES-*
    CLI->>ForgeIngest: 6. POST payload (Authorization: Bearer <TOKEN>)
    ForgeIngest-->>CLI: 7. Xác thực Token & Project ES → Lưu DB → Trả về HTTP 201 {"ok":true}

    ForgeIngest->>SyncWorker: 8. Đẩy sự kiện đồng bộ bất đồng bộ (Forge Queue / Cron 5 phút)
    SyncWorker->>JiraUI: 9. Tạo/cập nhật TestCase (ES-1024..ES-1059) & TestExecution (ES-1071..ES-1080)<br/>trên Jira Project ES (Test design & Test execution)
```

---

## 2. Hình ảnh DEMO Thực Tế Từng Bước

### Bước 1: Lấy cấu hình CI/CD Template trên Jira (`Project ES`)
Trên Jira (`pipevo.atlassian.net` → Project **`ES`** → **Apps → GitHub Actions → Setup**), chọn framework **Vitest** để nhận mẫu [`.github/workflows/ai-testing-tool-vitest.yml`](../../.github/workflows/ai-testing-tool-vitest.yml) cùng `CI INGEST ENDPOINT` và `INGEST TOKEN`:

![Bước 1: Lấy cấu hình CI/CD Template trên Jira Project ES](./media/demo_step1_jira_setup.png)

---

### Bước 2: Thiết lập GitHub Secrets & Variables thực tế trên GitHub
Khai báo `AI_TESTING_TOOL_INGEST_URL`, `AI_TESTING_TOOL_INGEST_TOKEN` (Repository Secrets), `JIRA_PROJECT_KEY = ES` (Repository Variable) trên GitHub (`Settings → Secrets and variables → Actions`):

![Bước 2: Cấu hình GitHub Secrets và Variables](./media/demo_step2_github_secrets.png)

---

### Bước 3: GitHub Actions Cloud Runner thực thi Workflow `AiTestingTool Vitest #2`
- **Link lượt chạy thực tế:** [`https://github.com/danhhoangjunior/testing-tool-js-demo/actions/runs/39590640214/job/119190417344`](https://github.com/danhhoangjunior/testing-tool-js-demo/actions/runs/39590640214/job/119190417344)
- GitHub Actions chạy `npm ci`, chạy `npx vitest run --reporter=json --outputFile=ai-testing-tool-results.json` (`195` tests, `197` steps) và upload qua `@ai-testing-tool/forge-api-client` (`--project "ES" --launch "AiTestingTool Vitest #2"`), nhận phản hồi **`Ingest upload: 100% — Ingest accepted (HTTP 201)`**:

![Bước 3: GitHub Actions thực thi job test và upload báo cáo](./media/demo_step3_github_actions_run.png)

---

### Bước 4: Chạy lệnh Demo Thực Tế (`sh docs/github-actions/demo-github-actions.sh`)
Thực thi trực tiếp luồng GitHub Actions từ terminal:
```bash
sh docs/github-actions/demo-github-actions.sh
```

![Bước 4: Kết quả chạy demo-github-actions.sh](./media/demo_step4_terminal_execution.png)

---

### Bước 5: Đồng bộ Suites & Automated Test Cases trên Jira (`Empty Space → Test design`)
Sau khi Forge Web Trigger (`ingest.ts`) trả về `HTTP 201 {"ok":true}`, worker `launch-sync.ts` tự động đồng bộ các Test Suites (`@ai-testing-tool/forge-api-client CLI`, `generateCiTemplate — all platforms × frameworks`, `Error Handling`...) và tạo các bản ghi **TestCase (`ES-1024` … `ES-1059`)** với loại **`Automated`** trên tab **Test design**:

![Bước 5: Màn hình Test design trên Jira Project ES](./media/demo_step5_jira_builds_sync.png)

---

### Bước 6: Đồng bộ Kết quả Chạy Test trên Jira (`Empty Space → Test execution`)
Trên tab **Test execution** của project **`ES`**, các bản ghi **TestExecution (`ES-1071` … `ES-1080`)** được ghi nhận với loại **`Automated`** và trạng thái **`PASSED`**:

![Bước 6: Màn hình Test execution trên Jira Project ES sau khi đồng bộ](./media/demo_jira_test_execution.png)
