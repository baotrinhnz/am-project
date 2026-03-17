# Cách tính BPM — Ambient Beat Monitor

## Tổng quan

BPM (Beats Per Minute) được đo liên tục từ âm thanh môi trường xung quanh — không phải từ nhạc được nhận dạng. Mục tiêu là đo **nhịp độ âm thanh chung của không gian** (nhạc nền, tiếng động có nhịp...), không phải BPM chính xác của một bài nhạc cụ thể.

---

## Chu kỳ đo

```
record 5s → detect BPM → ghi Supabase → sleep 10s → lặp lại
```

Mỗi 15 giây, Pi ghi 5 giây âm thanh rồi tính BPM một lần.

---

## Cách tính chi tiết

### 1. Ghi âm

- Thiết bị: `plughw:adau7002` (MEMS mic I2S)
- Format: `48kHz, S32_LE, stereo`
- Thời lượng: **5 giây**
- Sau khi ghi: boost âm lượng bằng `sox norm -3` vì MEMS mic rất nhỏ

### 2. Phân tích beat — thư viện aubio

Dùng `aubio.tempo("default", win_s=1024, hop_s=512, samplerate=48000)`:

- File WAV được đọc từng **chunk 512 mẫu** (~10.7ms mỗi chunk)
- Mỗi chunk được nạp vào bộ phát hiện tempo của aubio
- Khi aubio xác định có beat tại chunk đó → ghi lại **timestamp (giây)**

**aubio hoạt động như thế nào bên trong:**
aubio dùng thuật toán **onset detection** — tìm các điểm âm thanh tăng đột ngột về năng lượng (onset), sau đó tính khoảng cách giữa các onset để suy ra BPM. Không phải đếm từng tiếng trống, mà là phân tích sự thay đổi năng lượng theo thời gian.

### 3. Lấy BPM từ aubio

Sau khi duyệt hết file:

```python
bpm = tempo.get_bpm()
```

aubio tự tổng hợp tất cả beat đã phát hiện và trả về một con số BPM duy nhất — trung bình có trọng số của các khoảng cách beat trong suốt 5 giây đó.

### 4. Lọc kết quả

```python
if len(beats) < 3:
    return None   # không đủ beat để kết luận

if bpm < 40 or bpm > 220:
    return None   # ngoài dải nhạc thực tế
```

- Dưới 3 beat trong 5 giây → bỏ qua (có thể là im lặng hoặc tiếng ồn ngẫu nhiên)
- Ngoài khoảng 40–220 BPM → bỏ qua (không phải nhịp nhạc)

### 5. Tính confidence

```python
intervals  = [beats[i+1] - beats[i] for i in range(len(beats) - 1)]
mean_i     = trung bình khoảng cách giữa các beat
std_i      = độ lệch chuẩn
cv         = std_i / mean_i          # Coefficient of Variation
confidence = max(0, min(1, 1 - cv*3))
```

**Ý nghĩa:**
- Beat **đều đặn** (nhạc có nhịp rõ) → khoảng cách giữa các beat gần bằng nhau → `cv` nhỏ → `confidence` cao
- Beat **loạn** (tiếng ồn, nói chuyện) → khoảng cách lộn xộn → `cv` lớn → `confidence` thấp hoặc = 0

Ví dụ:
| Tình huống | cv | confidence |
|---|---|---|
| Nhạc dance rõ nhịp | ~0.05 | ~0.85 |
| Nhạc ballad mờ nhịp | ~0.25 | ~0.25 |
| Tiếng ồn ngẫu nhiên | >0.33 | 0.0 |

---

## Tại sao con số BPM đó xuất hiện?

Con số BPM cuối cùng (ví dụ `118.8`) là kết quả của aubio sau khi:

1. Nghe 5 giây âm thanh xung quanh
2. Tìm các điểm năng lượng tăng đột ngột (onset)
3. Suy ra nhịp từ khoảng cách các onset
4. Trả về BPM trung bình có trọng số

**Điều này có nghĩa:** nếu trong phòng đang phát nhạc 120 BPM, con số ~120 sẽ xuất hiện. Nếu không có nhạc nhưng có tiếng gõ đều, con số đó cũng có thể xuất hiện. BPM là đo lường **nhịp độ âm thanh môi trường**, không phải nhận dạng bài nhạc.

---

## Giới hạn của cách đo này

- **5 giây là ngắn** — với nhạc chậm (60 BPM), chỉ có ~5 beat, confidence thấp
- **Tiếng ồn có thể giả BPM** — tiếng quạt, điều hòa đôi khi tạo pattern tuần hoàn
- **Không phân biệt nhạc và tiếng động** — chỉ đo nhịp, không quan tâm nguồn
- **Phụ thuộc âm lượng** — nếu quá nhỏ dù đã boost, aubio có thể không detect được onset
