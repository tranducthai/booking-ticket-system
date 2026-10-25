-- "Thông tin tài khoản": optional date of birth and gender.
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

ALTER TABLE "User" ADD COLUMN "dateOfBirth" DATE,
ADD COLUMN "gender" "Gender";
