# Hướng dẫn cài và sử dụng Content Minify CLI

## 1. Yêu cầu

Máy cần có:

- Node.js 20 trở lên
- Git
- Google Chrome hoặc Microsoft Edge
- Quyền truy cập repository nội bộ trên GitHub

## 2. Cài đặt

Mở PowerShell và chạy:

```powershell
npm.cmd install -g https://github.com/nqhai-hoyu/content-minify-cli.git#v0.2.0
```

Nếu GitHub yêu cầu đăng nhập, hãy đăng nhập bằng tài khoản đã được cấp quyền.

Kiểm tra phiên bản:

```powershell
minify.cmd --version
```

Kết quả:

```text
0.2.0
```

## 3. Sử dụng

Ví dụ có thư mục dự án:

```text
D:\projects\
├─ CONTENT_01\
└─ C02\
```

Mở terminal tại thư mục cha rồi chạy:

```powershell
cd D:\projects
minify.cmd CONTENT_01
```

Kết quả được tạo tại:

```text
D:\projects\dist\CONTENT_01
```

Thư mục `CONTENT_01` gốc không bị thay đổi.

## 4. Một số tùy chọn

```powershell
# Xem trước, không tạo output
minify.cmd CONTENT_01 --dry-run

# Chọn thư mục output
minify.cmd CONTENT_01 --out release\CONTENT_01

# Xem trợ giúp
minify.cmd --help
```

Nếu PowerShell cho phép, có thể dùng `minify` thay cho `minify.cmd`.

## 5. Cập nhật

Cài phiên bản mới nhất từ nhánh chính:

```powershell
npm.cmd install -g https://github.com/nqhai-hoyu/content-minify-cli.git
```

## 6. Gỡ cài đặt

```powershell
npm.cmd uninstall -g content-minify-cli
```

## 7. Lỗi thường gặp

### `minify` bị PowerShell chặn

Dùng lệnh:

```powershell
minify.cmd CONTENT_01
```

### Không truy cập được repository

Kiểm tra tài khoản GitHub đã được thêm vào repository nội bộ hay chưa.

### Không tìm thấy Chrome hoặc Edge

Cài Chrome/Edge hoặc đặt đường dẫn browser bằng biến môi trường
`MINIFY_BROWSER_PATH`.

Tool giữ nguyên tên file và cấu trúc thư mục, nhưng obfuscation không phải mã
hóa tuyệt đối. Không đặt mật khẩu, API key hoặc private key trong mã phía
trình duyệt.
