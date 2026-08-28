# Changelog

## 0.3.0

- Tách rõ hai mức xử lý: minification mặc định và obfuscation tùy chọn.
- Thêm tùy chọn `--obfuscate` để minify rồi làm rối JavaScript.
- Dùng Terser, CleanCSS và html-minifier-terser cho chế độ minification.
- Chỉ gọi javascript-obfuscator khi người dùng chọn obfuscation.
- Tiếp tục giữ nguyên tên file, cấu trúc thư mục và xác minh bằng browser.

## 0.2.0

- Bảo vệ toàn bộ file HTML, CSS và JavaScript trong content.
- Minify/obfuscate JavaScript inline.
- Hỗ trợ ES modules và đường dẫn script root-relative.
- Mở và xác minh tất cả trang HTML trước khi publish.
- Cho phép smoke checks nhắm tới từng trang bằng thuộc tính `page`.
- Thêm action `wait` cho hành vi bất đồng bộ và animation.
- Thêm `--out`, `--dry-run`, `--help` và `--version`.
- Giữ nguyên toàn bộ tên file và cấu trúc thư mục.
