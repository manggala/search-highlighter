# Bulk Search Highlighter

Chrome Extension untuk mencari banyak term sekaligus pada halaman aktif dan memberi highlight pada setiap hasil.

## Fitur

- Home menu saat extension pertama kali dibuka.
- Tool terpisah bernama **Bulk Search Highlighter**.
- Input search array dengan separator:
	- Enter/new line sebagai default.
	- Hyphen (`-`).
	- Semicolon (`;`).
	- Comma (`,`).
- Pencarian case-insensitive dan aman untuk term yang mengandung karakter regex.
- Highlight hasil pencarian menggunakan elemen `<mark>`.
- Tabel hasil di bawah tool yang menampilkan setiap term, status **Found**/ **Not found**, dan jumlah match.
- Tombol **Clear** untuk menghapus highlight, tanda row, dan tabel hasil.
- Tombol **Check same row** untuk memilih action pada row tabel yang cocok.

## Alur Search Page

1. Isi beberapa term pada textarea.
2. Pilih separator sesuai format data.
3. Klik **Search page**.
4. Extension membersihkan highlight sebelumnya, mencari term pada text node halaman, lalu membungkus hasil dengan `<mark data-bulk-search-highlight>`.
5. Tabel hasil diberi warna hijau bila term ditemukan dan merah bila tidak ditemukan.

Area `SCRIPT`, `STYLE`, `NOSCRIPT`, `TEXTAREA`, dan `INPUT` tidak ikut diproses.

## Alur Check Same Row

Untuk setiap term, extension menjalankan proses berikut pada halaman aktif:

1. Mencari parent row (`table tr`) yang memuat term.
2. Menelusuri child/descendant parent row untuk mencari action icon dengan pola `i[id^="show_"]`.
3. Menyimpan hasil ke array object `probablyclicked`:

```javascript
probablyclicked.push({ term, parentRow, actionLink, actionIcon });
```

4. Mengambil parent `<a>` dari icon melalui `actionIcon.closest('a')`.
5. Bila icon masih memiliki class `fa-square-o`, extension menjalankan `actionLink.click()`.

Contoh struktur action e-BMD yang didukung:

```html
<a href="javascript:show(10235,2)" id="title_10235">
	<i id="show_10235" class="fa fa-square-o"></i>
</a>
```

Icon yang sama hanya diproses satu kali. Parent row yang cocok diberi outline dan background hijau. Checkbox HTML biasa juga dapat diproses sebagai fallback bila tersedia.

## File Structure

- `hello.html` + `home.js`: home menu extension.
- `bulk-search.html` + `bulk-search.css` + `bulk-search.js`: Bulk Search Highlighter tool.
- `manifest.json`: konfigurasi Chrome Extension dan permission `activeTab` serta `scripting`.
- `hello_extensions.png`: icon extension.

## Running This Extension

1. Clone this repository or download the extension folder.
2. Load this directory in Chrome as an [unpacked extension](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked).
3. Open a web page and click the extension icon to open the home menu.
4. Select **Bulk Search Highlighter**, enter terms separated by Enter, `-`, `;`, or `,`, then click **Search page**.
5. Use **Check same row** to search terms like **Search page**, then click the unchecked checkbox or e-BMD Action icon in each matching table row.
6. Use **Clear** to remove the highlights and row marks from the page, or the back arrow to return to the home menu.

## Batasan

- Script tidak dapat berjalan pada halaman terlarang Chrome seperti `chrome://` dan Chrome Web Store.
- **Check Same Row** hanya memeriksa row yang sedang ada di DOM.
- Pada halaman yang menggunakan DataTables `server-side`, data di halaman lain atau data yang belum dimuat tidak ikut diperiksa.
- Action e-BMD harus memiliki icon dengan pola `i[id^="show_"]` dan parent `<a>` agar dapat di-click otomatis.