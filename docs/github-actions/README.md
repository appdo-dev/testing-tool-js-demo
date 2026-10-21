# Tài liệu & DEMO: Tích Hợp GitHub Actions (`testing-tool-js` ↔ `qa-analyzer` — Project `ES`)

Thư mục này chứa toàn bộ tài liệu kiến trúc, cấu hình, script chạy thử và bộ hình ảnh / video màn hình cho luồng CI/CD **GitHub Actions** giữa repository `testing-tool-js` (`https://github.com/ai-testing-tool/testing-tool-js`) và ứng dụng Jira Cloud `qa-analyzer` (`https://pipevo.atlassian.net/jira/software/projects/ES/...`, project key **`ES`**).

## Cấu trúc thư mục `docs/github-actions/`

| File / Thư mục | Mô tả |
| :--- | :--- |
| [`README.md`](./README.md) | Tài liệu phân tích luồng hoạt động, hướng dẫn cài đặt & hình ảnh DEMO từng bước |
| [`.env.example`](./.env.example) | Mẫu cấu hình `.env` để đẩy kết quả từ local lên Forge Web Trigger của project `ES` |
| [`demo-github-actions.sh`](./demo-github-actions.sh) | Script chạy Demo thực tế (`sh docs/github-actions/demo-github-actions.sh`) |
| [`media/demo_github_actions_flow.mp4`](./media/demo_github_actions_flow.mp4) | Video ghi màn hình toàn trình 5 bước (MP4) |
| [`media/demo_step1_jira_setup.png`](./media/demo_step1_jira_setup.png) | Ảnh Bước 1: Màn hình CI/CD Pipeline → GitHub Actions → Setup trên Jira (`ES`) |
| [`media/demo_step2_github_secrets.png`](./media/demo_step2_github_secrets.png) | Ảnh Bước 2: Cấu hình GitHub Secrets/Variables & file workflow |
| [`media/demo_step3_github_actions_run.png`](./media/demo_step3_github_actions_run.png) | Ảnh Bước 3: GitHub Actions thực thi job `test` và upload báo cáo FR41 |
| [`media/demo_step4_terminal_execution.png`](./media/demo_step4_terminal_execution.png) | Ảnh Bước 4: Kết quả thực thi script Demo trên Terminal |
| [`media/demo_step5_jira_builds_sync.png`](./media/demo_step5_jira_builds_sync.png) | Ảnh Bước 5: Màn hình CI/CD Pipeline → Builds & Traceability trên Jira (`ES`) |
| [`media/demo_jira_test_execution.png`](./media/demo_jira_test_execution.png) | Ảnh màn hình Test Execution trên Jira sau khi đồng bộ |

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

    GH->>GH: 3. npm ci
    GH->>Vitest: 4. npx vitest run --reporter=json --outputFile=ai-testing-tool-results.json
    Note over Vitest: Plugin ai-testing-tool-cli-bridge kích hoạt<br/>@ai-testing-tool/forge-vitest xuất báo cáo FR41
    Vitest-->>GH: Xuất ai-testing-tool-results.json (FR41)<br/>kèm meta.qa (issueKeys, suite, steps, host)

    GH->>CLI: 5. npx @ai-testing-tool/forge-api-client<br/>--project "ES" --launch "AiTestingTool Vitest #42" --report ai-testing-tool-results.json
    Note over CLI: • detectCiEnvironment(): ciPlatform="github", ciBuildUrl, gitCommitSha...<br/>• remapReportIssueKeyPrefix(): chuẩn hóa issueKeys sang ES-*
    CLI->>ForgeIngest: 6. POST payload (Authorization: Bearer <TOKEN>)
    ForgeIngest-->>CLI: 7. Xác thực Token & Project ES → Lưu DB → Trả về HTTP 201 {"ok":true}

    ForgeIngest->>SyncWorker: 8. Đẩy sự kiện đồng bộ bất đồng bộ (Forge Queue / Cron 5 phút)
    SyncWorker->>JiraUI: 9. Tạo/cập nhật TestCase & TestExecution issues trên Jira,<br/>gắn link vào ES-101..ES-114 & hiển thị lịch sử build GitHub Actions
```

---

## 2. Hình ảnh DEMO Từng Bước

### Bước 1: Lấy cấu hình CI/CD Template trên Jira (`Project ES`)
Trên Jira (`pipevo.atlassian.net` → Project **`ES`** → **Apps → GitHub Actions → Setup**), chọn framework **Vitest** để nhận mẫu [`.github/workflows/ai-testing-tool-vitest.yml`](../../.github/workflows/ai-testing-tool-vitest.yml) cùng danh sách Secrets/Variables:

![Bước 1: Lấy cấu hình CI/CD Template trên Jira Project ES](./media/demo_step1_jira_setup.png)

---

### Bước 2: Thiết lập GitHub Secrets/Variables & File Workflow
Khai báo `AI_TESTING_TOOL_INGEST_URL`, `AI_TESTING_TOOL_INGEST_TOKEN` (Repository Secrets), `JIRA_PROJECT_KEY = ES` (Repository Variable) và thêm file [`.github/workflows/ai-testing-tool-vitest.yml`](../../.github/workflows/ai-testing-tool-vitest.yml):

![Bước 2: Cấu hình GitHub Secrets/Variables và File Workflow](./media/demo_step2_github_secrets.png)

---

### Bước 3: GitHub Actions thực thi Workflow `AiTestingTool Vitest #42`
Khi có `push` lên `main` hoặc `pull_request`, GitHub Actions chạy `npm ci`, chạy `npx vitest run --reporter=json --outputFile=ai-testing-tool-results.json` (xuất báo cáo FR41 với `195` tests, `197` steps) và upload qua `@ai-testing-tool/forge-api-client` (tự động ánh xạ `113` mã `ES-*` theo `--project ES`):

![Bước 3: GitHub Actions thực thi job test và upload báo cáo](./media/demo_step3_github_actions_run.png)

---

### Bước 4: Chạy lệnh Demo Thực Tế (`sh docs/github-actions/demo-github-actions.sh`)
Thực thi trực tiếp luồng GitHub Actions từ terminal:
```bash
sh docs/github-actions/demo-github-actions.sh
```

![Bước 4: Kết quả chạy demo-github-actions.sh](./media/demo_step4_terminal_execution.png)

---

### Bước 5: Kết quả Đồng bộ Launch & Traceability trên Jira (`Project ES`)
Sau khi Forge Web Trigger (`ingest.ts`) trả về `HTTP 201 {"ok":true}`, worker `launch-sync.ts` đồng bộ các bản ghi **TestCase** & **TestExecution**, gắn link vào `ES-101` … `ES-114` và hiển thị trên màn hình **CI/CD Pipeline → Builds** và **Test Execution**:

![Bước 5: Màn hình CI/CD Pipeline Builds trên Jira Project ES](./media/demo_step5_jira_builds_sync.png)

![Màn hình Test Execution trên Jira sau khi đồng bộ](./media/demo_jira_test_execution.png)
