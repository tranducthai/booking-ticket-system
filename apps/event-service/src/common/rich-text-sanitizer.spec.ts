import { richTextToPlain, sanitizeRichText } from "./rich-text-sanitizer";

describe("sanitizeRichText", () => {
  it("keeps the editor's formatting (style whitespace normalized)", () => {
    const html =
      '<h2 style="text-align: center">Giới thiệu</h2><p><span style="color: #e11d48; font-size: 20px">Đỏ to</span> <strong>đậm</strong> <em>nghiêng</em> <u>gạch</u></p><ul><li>Một</li></ul><img src="https://x.supabase.co/a.png" alt="poster">';
    expect(sanitizeRichText(html)).toBe(
      '<h2 style="text-align:center">Giới thiệu</h2><p><span style="color:#e11d48;font-size:20px">Đỏ to</span> <strong>đậm</strong> <em>nghiêng</em> <u>gạch</u></p><ul><li>Một</li></ul><img src="https://x.supabase.co/a.png" alt="poster" />',
    );
  });

  it.each([
    ['<p onclick="alert(1)">x</p>', "<p>x</p>"],
    ["<script>alert(1)</script><p>ok</p>", "<p>ok</p>"],
    ['<img src="javascript:alert(1)">', "<img />"],
    ['<img src="data:image/png;base64,AAAA">', "<img />"],
    ['<a href="javascript:alert(1)">x</a>', '<a target="_blank" rel="noopener noreferrer nofollow">x</a>'],
    ['<iframe src="https://evil.example"></iframe><p>ok</p>', "<p>ok</p>"],
    ['<p style="position: fixed; color: red; background: url(https://evil)">x</p>', "<p>x</p>"],
    ['<p style="color: #ff0000; position: fixed">x</p>', '<p style="color:#ff0000">x</p>'],
  ])("strips dangerous markup: %s", (input, expected) => {
    expect(sanitizeRichText(input)).toBe(expected);
  });

  it("forces links to open safely in a new tab", () => {
    expect(sanitizeRichText('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
  });
});

describe("richTextToPlain", () => {
  it("drops tags for tokenizing", () => {
    expect(richTextToPlain("<h2>Đêm nhạc</h2><p>Acoustic <strong>Hà Nội</strong></p>")).toBe("Đêm nhạcAcoustic Hà Nội");
  });
});
