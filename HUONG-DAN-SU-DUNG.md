# Hướng dẫn cài và sử dụng Content Minify CLI

Muốn tìm hiểu công nghệ và source code của tool, xem
[TAI-LIEU-KY-THUAT.md](TAI-LIEU-KY-THUAT.md).

## 1. Yêu cầu

Máy cần có:

- Node.js 20 trở lên
- Git
- Google Chrome hoặc Microsoft Edge
- Quyền truy cập repository nội bộ trên GitHub

## 2. Cài đặt

Mở PowerShell và chạy:

```powershell
npm.cmd install -g https://github.com/nqhai-hoyu/content-minify-cli.git#v0.4.0
```

Nếu GitHub yêu cầu đăng nhập, hãy đăng nhập bằng tài khoản đã được cấp quyền.

Kiểm tra phiên bản:

```powershell
minify.cmd --version
```

Kết quả:

```text
0.4.0
```

## 3. Sử dụng

Ví dụ có thư mục dự án:

```text
D:\projects\
├─ CONTENT_01\
└─ C02\
```

Mở terminal tại thư mục cha rồi chọn một trong hai mức xử lý.

### Mức 1: Minification

Thu gọn HTML, CSS và JavaScript để giảm dung lượng. Đây là chế độ mặc định:

```powershell
cd D:\projects
minify.cmd CONTENT_01
```

### Mức 2: Obfuscation

Minify toàn bộ content, sau đó làm rối JavaScript để khó đọc và khó reverse
engineer hơn:

```powershell
cd D:\projects
minify.cmd CONTENT_01 --obfuscate
```

Kết quả được tạo tại:

```text
D:\projects\dist\CONTENT_01
```

Thư mục `CONTENT_01` gốc không bị thay đổi.

Cả hai mức đều giữ nguyên tên file, cấu trúc thư mục và kiểm tra các trang bằng
Chrome/Edge trước khi xuất kết quả.

### Xử lý nhiều content trong một lệnh

```powershell
# Minification
minify.cmd CONTENT_01 C02

# Minification rồi obfuscation
minify.cmd CONTENT_01 C02 --obfuscate
```

Các content được xử lý tuần tự và tạo kết quả riêng:

```text
D:\projects\dist\
├─ CONTENT_01\
└─ C02\
```

Nếu một content lỗi, tool dừng tại content đó. Những content đã hoàn thành trước
đó không bị xóa hoặc rollback. Không dùng `--out` khi truyền nhiều content.

## 4. Một số tùy chọn

```powershell
# Minify rồi làm rối JavaScript
minify.cmd CONTENT_01 --obfuscate

# Xem trước, không tạo output
minify.cmd CONTENT_01 --dry-run

# Chọn thư mục output; chỉ dùng cho một content
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
