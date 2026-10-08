# MAE MOH Medical Equipment Center

ระบบบริหารกายอุปกรณ์ศูนย์กลางสำหรับอำเภอแม่เมาะ พัฒนาด้วย React, TypeScript, Vite และ Supabase

## เปิดใช้งานในเครื่อง

1. ติดตั้ง Node.js 20 ขึ้นไป (มาพร้อม npm)
2. คัดลอก `.env.example` เป็น `.env` แล้วกำหนด `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ด้วยค่า Supabase URL และ publishable key ของโปรเจกต์ `plshotnedcokbysafzqs`
3. รัน `npm install`
4. รัน `npm run dev` แล้วเปิด URL ที่แสดงใน terminal (ปกติคือ `http://localhost:5173/`)

AppServ/Apache ใช้เสิร์ฟไฟล์เว็บที่ build แล้วได้ ดูไฟล์ใน `dist/` หลังรัน `npm run build` ห้ามใช้ `service_role` หรือ secret key ใน frontend

## เผยแพร่ผ่าน GitHub Pages

workflow จะ deploy อัตโนมัติทุกครั้งที่ push เข้า `main` เมื่อ GitHub Pages เปิดใช้งานแล้ว เว็บจะอยู่ที่ `https://maemoh-health.github.io/Medical-Equipment/`

ก่อน deploy ครั้งแรก เปิด **Settings → Pages** ของ repository แล้วตั้ง **Source: GitHub Actions** จากนั้นตรวจผลที่แท็บ **Actions**

workflow ใช้ Supabase publishable key ซึ่งออกแบบมาสำหรับ frontend; ห้ามแทนที่ด้วย `service_role` หรือ secret key

## ฐานข้อมูลและเริ่มต้นผู้ดูแล

Schema ใช้ migrations ใน `supabase/migrations/` และถูกนำไปใช้กับ Supabase โปรเจกต์เดิมแล้ว ทุกตารางใน `public` เปิด RLS และไม่มีการใส่ข้อมูลทะเบียนสมมติ

1. สร้างหรือใช้บัญชีผู้ใช้ใน Supabase Dashboard → Authentication → Users โดยปิด public sign-up หากไม่ต้องการให้บุคคลทั่วไปสมัครเอง
2. ใน SQL Editor เพิ่มองค์กร/สถานที่จริงจากทะเบียนหน่วยงาน แล้วกำหนด role ให้บัญชีผู้ดูแล
3. เข้าระบบในแอป สร้างสถานที่และประเภทอุปกรณ์จริงผ่านเมนู แล้วจึงเพิ่มหรือนำเข้าทะเบียนอุปกรณ์
4. ผู้ใช้งานรายอื่นต้องได้รับบัญชีและกำหนด `organization_id`, `location_id` และ `role` โดยผู้ดูแลระบบ

บทบาท `executive` อ่านภาพรวมได้ทั้งอำเภอ แต่ไม่มีสิทธิ์แก้ไขคลัง ส่วน `facility_officer` ถูกจำกัดอุปกรณ์ไว้ที่ `location_id` ของโปรไฟล์โดย RLS

## สิ่งที่มีในรุ่นนี้

- Login ด้วย Supabase Auth และ session persistence
- Dashboard และทะเบียนอุปกรณ์อ่านข้อมูลจริงจาก Supabase, ค้นหา และส่งออก CSV
- เพิ่มอุปกรณ์ สถานที่ และประเภทอุปกรณ์ตามสิทธิ์
- ตารางธุรกรรมยืม-คืน ซ่อม ตรวจสภาพ และรายงาน
- RLS, indexes, audit triggers, business status guards และ dashboard views
- Responsive layout สำหรับจอเล็กและ desktop

รายการที่ต้องใช้ทะเบียน Excel จริงจึงจะทำได้คือการ import และตรวจ mapping ของข้อมูลเดิม ไฟล์ `ทะเบียนวัสดุและครุภัณฑ์.xlsx` ยังไม่ได้รับมา
