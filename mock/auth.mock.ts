import { defineMock } from "./base";

export default defineMock([
  {
    url: "auth/login",
    method: ["POST"],
    body: {
      code: "00000",
      data: {
        accessToken:
          "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImRlcHRJZCI6MSwiZGF0YVNjb3BlIjoxLCJ1c2VySWQiOjIsImlhdCI6MTcyODE5MzA1MiwiYXV0aG9yaXRpZXMiOlsiUk9MRV9BRE1JTiJdLCJqdGkiOiJhZDg3NzlhZDZlYWY0OWY3OTE4M2ZmYmI5OWM4MjExMSJ9.58YHwL3sNNC22jyAmOZeSm-7MITzfHb_epBIz7LvWeA",
        tokenType: "Bearer",
        refreshToken:
          "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImRlcHRJZCI6MSwiZGF0YVNjb3BlIjoxLCJ1c2VySWQiOjIsImlhdCI6MTcyODE5MzA1MiwiYXV0aG9yaXRpZXMiOlsiUk9MRV9BRE1JTiJdLCJqdGkiOiJhZDg3NzlhZDZlYWY0OWY3OTE4M2ZmYmI5OWM4MjExMSJ9.58YHwL3sNNC22jyAmOZeSm-7MITzfHb_epBIz7LvWeA",
        expiresIn: 7200,
      },
      msg: "一切ok",
    },
  },

  {
    url: "auth/refresh-token",
    method: ["POST"],
    body: {
      code: "00000",
      data: {
        accessToken:
          "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImRlcHRJZCI6MSwiZGF0YVNjb3BlIjoxLCJ1c2VySWQiOjIsImlhdCI6MTcyODE5MzA1MiwiYXV0aG9yaXRpZXMiOlsiUk9MRV9BRE1JTiJdLCJqdGkiOiJhZDg3NzlhZDZlYWY0OWY3OTE4M2ZmYmI5OWM4MjExMSJ9.58YHwL3sNNC22jyAmOZeSm-7MITzfHb_epBIz7LvWeA",
        tokenType: "Bearer",
        refreshToken:
          "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImRlcHRJZCI6MSwiZGF0YVNjb3BlIjoxLCJ1c2VySWQiOjIsImlhdCI6MTcyODE5MzA1MiwiYXV0aG9yaXRpZXMiOlsiUk9MRV9BRE1JTiJdLCJqdGkiOiJhZDg3NzlhZDZlYWY0OWY3OTE4M2ZmYmI5OWM4MjExMSJ9.58YHwL3sNNC22jyAmOZeSm-7MITzfHb_epBIz7LvWeA",
        expiresIn: 7200,
      },
      msg: "一切ok",
    },
  },

  {
    url: "auth/logout",
    method: ["DELETE"],
    body: {
      code: "00000",
      data: {},
      msg: "string",
    },
  },
]);
