// Lightweight API response types shared between frontend hooks and backend routes
// These do NOT need to match Prisma types exactly — just the fields the frontend uses

export interface ApiStudent {
  id:             string
  registrationNo: string
  firstName:      string
  lastName:       string
  dateOfBirth:    string
  sex:            "MALE" | "FEMALE"
  nationality:    string
  district:       string
  village?:       string
  phone?:         string
  guardianName:   string
  guardianPhone:  string
  guardianRelation: string
  status:         string
  classId?:       string
  class?:         { id: string; name: string; form: number }
}

export interface ApiStudentListResponse {
  students: ApiStudent[]
  total:    number
  page:     number
  pages:    number
}

export interface ApiClass {
  id:          string
  name:        string
  form:        number
  stream?:     string
  room?:       string
  teacherId?:  string
  academicYear:string
  students?:   ApiStudent[]
  _count?:     { students: number }
}

export interface ApiTimetableSlot {
  id:          string
  classId:     string
  day:         string
  periodStart: string
  periodEnd:   string
  subject:     string
  teacherUid:  string
  room?:       string
  type:        string
}

export interface ApiApplication {
  id:              string
  firstName:       string
  lastName:        string
  dateOfBirth:     string
  sex:             "MALE" | "FEMALE"
  nationality:     string
  district:        string
  guardianName:    string
  guardianPhone:   string
  guardianRelation:string
  applyingForForm: number
  status:          string
  createdAt:       string
  notes?:          string
}