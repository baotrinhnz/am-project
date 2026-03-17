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

**aubio là gì:**
aubio là thư viện mã nguồn mở chuyên về phân tích âm nhạc, được phát triển từ năm 2003 bởi Paul Brossier trong luận án tiến sĩ tại Queen Mary University of London. Nó được dùng rộng rãi trong nghiên cứu âm nhạc, phần mềm DJ, và các ứng dụng xử lý âm thanh thời gian thực. aubio không phải tự viết thuật toán — nó triển khai các **thuật toán đã được chuẩn hoá trong ngành** (xem bên dưới).

**Cách tính này có chuẩn không:**
Có. aubio dùng phương pháp **onset detection + autocorrelation** — đây là hai kỹ thuật học thuật đã được công bố và kiểm chứng trong cộng đồng nghiên cứu Music Information Retrieval (MIR). Không phải tự nghĩ ra. Cụ thể:

- **Onset detection**: phát hiện điểm âm thanh bắt đầu dựa trên sự thay đổi năng lượng theo tần số — được mô tả lần đầu trong các bài báo của Brossier, Dixon, và Scheirer từ những năm 2000
- **Autocorrelation để tìm tempo**: so sánh tín hiệu với chính nó ở các độ trễ khác nhau để tìm chu kỳ lặp lại — là kỹ thuật cơ bản trong xử lý tín hiệu số (DSP)

Nói ngắn gọn: **đây là chuẩn ngành, không phải heuristic tự viết**.

---

aubio không "nghe" cả file rồi mới tính — nó xử lý âm thanh **từng mảnh nhỏ liên tiếp**, giống như tai người nghe nhạc theo thời gian thực.

**Chia nhỏ âm thanh:**
File 5 giây ở 48kHz có 240.000 mẫu. aubio đọc từng đoạn 512 mẫu một (~10ms mỗi đoạn), tức khoảng 470 lần trong 5 giây. Mỗi lần đọc, nó hỏi: *"có beat ở đây không?"*

**aubio phát hiện beat bằng cách nào:**
Tai người nhận ra beat vì có sự thay đổi đột ngột — tiếng trống đánh xuống, tiếng bass bật lên, âm thanh bỗng to hơn. aubio làm điều tương tự: nó theo dõi **mức năng lượng** của âm thanh theo từng đoạn nhỏ. Khi năng lượng tăng vọt so với trước đó, đó được gọi là một **onset** — điểm bắt đầu của một âm.

Nhưng onset chưa phải beat. Tiếng nói, tiếng cốc chén cũng tạo ra onset. Điểm khác biệt là **nhịp điệu**: trong nhạc, các onset xảy ra đều đặn theo chu kỳ. aubio tích lũy các onset theo thời gian và tìm kiếm **chu kỳ lặp lại** — nếu onset cứ xuất hiện mỗi 0.5 giây thì BPM = 120.

**Window size — nhìn đủ rộng để thấy pattern:**
Để phát hiện chu kỳ, aubio không chỉ nhìn vào 512 mẫu hiện tại mà nhìn ngược lại một cửa sổ 1024 mẫu (~21ms). Cửa sổ này đủ rộng để so sánh "bây giờ" với "vừa rồi" và phát hiện sự thay đổi có nghĩa, loại bỏ các biến động nhỏ ngẫu nhiên.

**Kết quả sau 5 giây:**
aubio thu thập tất cả các thời điểm beat trong suốt 5 giây, sau đó tổng hợp lại thành một con số BPM duy nhất — không phải trung bình cộng đơn giản mà là ước lượng có trọng số, ưu tiên các beat gần đây hơn và các beat có độ tin cậy cao hơn.

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
