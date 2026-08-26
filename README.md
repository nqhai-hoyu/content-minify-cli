# Content Minify CLI

CLI minify HTML/CSS và obfuscate JavaScript của static web content. Tool giữ
nguyên toàn bộ tên file, cấu trúc thư mục và chỉ publish khi bản đầu ra vượt qua
kiểm tra Chrome/Edge.

## Yêu cầu

- Node.js 20 trở lên
- Google Chrome hoặc Microsoft Edge

## Cài trực tiếp từ GitHub

```powershell
npm.cmd install -g https://github.com/nqhai-hoyu/content-minify-cli.git
```

Hoặc clone để phát triển:

```powershell
git clone https://github.com/nqhai-hoyu/content-minify-cli.git
cd content-minify-cli
npm.cmd ci
npm.cmd link
```

Nếu PowerShell chặn npm shim `.ps1`, dùng `minify.cmd` thay cho `minify`.

## Sử dụng

Đứng tại thư mục cha của content:

```powershell
minify CONTENT_01
```

Tool giữ nguyên thư mục nguồn và tạo kết quả tại:

```text
dist\CONTENT_01
```

Mỗi file giữ nguyên tên/đường dẫn. Toàn bộ file HTML và CSS được minify; các file
JavaScript tự viết được minify và obfuscate tại chỗ. Tool hỗ trợ JavaScript
inline, ES modules và đường dẫn root-relative. File `*.min.js` và `*.min.css`
được giữ nguyên.

### Tùy chọn CLI

```powershell
# Chọn thư mục đầu ra
minify CONTENT_01 --out release\CONTENT_01

# Xem trước phạm vi xử lý, không tạo output
minify CONTENT_01 --dry-run

# Trợ giúp và phiên bản
minify --help
minify --version
```

## Kiểm tra chức năng riêng

Tạo `minify.verify.json` trong thư mục đang chạy lệnh:

```json
{
  "CONTENT_01": [
    {
      "action": "click",
      "page": "pages/lesson.html",
      "selector": "#btn-next"
    },
    {
      "action": "wait",
      "page": "pages/lesson.html",
      "milliseconds": 500
    },
    {
      "action": "expectText",
      "page": "pages/lesson.html",
      "selector": "#step",
      "equals": "Step: 2"
    }
  ]
}
```

Các action được hỗ trợ:

- `click`
- `drag`
- `wait`
- `expectText`
- `expectAttribute`

Thuộc tính `page` là tùy chọn; nếu bỏ qua, check chạy trên `index.html`. Không có
cấu hình riêng, tool vẫn mở và kiểm tra mọi trang HTML, lỗi JavaScript, lỗi tải
asset và HTTP error trong browser. Nếu kiểm tra thất bại, output tốt trước đó
không bị thay thế.

Có thể chọn browser executable bằng biến môi trường `MINIFY_BROWSER_PATH`.

## Kiểm thử

```powershell
npm.cmd ci
npm.cmd test
```

Obfuscation làm tăng đáng kể chi phí đọc/reverse-engineering nhưng không phải mã
hóa tuyệt đối đối với mã chạy trên trình duyệt.
