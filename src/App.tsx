import { useEffect, useState } from "react";
import * as cheerio from "cheerio";
import { classData, slots, weekdays } from "./constants/classData";
import { formGetter, secondFormGetter } from "./constants/formData";
import {
  textToColor,
  mapToObject,
  objectToMap,
  getClassKey,
  send,
  getCurrentSubjects,
  getCurrentStatus,
} from "./utils";

export default function App() {
  // Setup metadata
  const url = window.location.href;
  const id = url.slice(url.indexOf("=") + 1);
  const baseUrl = window.location.origin + window.location.pathname;
  const formData = formGetter(id);
  let secondId = "";
  let subject =
    document.getElementById("ctl00_mainContent_lblSubject")?.textContent || "";
  let controller = new AbortController();
  const signal = controller.signal;

  // Get cached data
  let cached = localStorage.getItem(subject);
  let timeTableData = cached ? JSON.parse(cached) : null;

  // Setup state
  const [timeTable, setTimeTable] = useState<
    Map<string, Map<string, string[]>>
  >(timeTableData ? objectToMap(timeTableData) : classData);
  const [total, setTotal] = useState(0);
  const [gotten, setGotten] = useState(0);
  const [isLoading, setIsLoading] = useState<any>({
    moving: false,
    fetching: false,
  });
  const [moveList, setMoveList] = useState<any>([]);
  const [studentCount, setStudentCount] = useState<any>({});
  const [changeSubjectForm, setChangeSubjectForm] = useState<any>({});
  const [lecturerList, setLecturerList] = useState<any>([]);
  const [filter, setFilter] = useState<any>({
    lecturer: "",
  });

  const handleStudentCount = async () => {
    setIsLoading((prev: any) => ({
      ...prev,
      fetching: true,
    }));
    const data = await getCurrentStatus(signal);
    setStudentCount(data);
    setIsLoading((prev: any) => ({
      ...prev,
      fetching: false,
    }));
    alert("Đã lấy xong sĩ số!");
  };

  useEffect(() => {
    crawlAndSave();
  }, []);

  useEffect(() => {
    (async () => {
      fetch(`https://fap.fpt.edu.vn/Course/Groups.aspx?group=${id}`)
        .then((response) => response.text())
        .then((html) => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const element = doc.querySelector("#ctl00_mainContent_divStudents");
          if (element) {
            document.getElementById("class-list")?.appendChild(element);
          }
        });

      const data = await getCurrentSubjects();
      setMoveList(data.currentSubjects);
      setChangeSubjectForm({
        __VIEWSTATE: data.__VIEWSTATE,
        __VIEWSTATEGENERATOR: data.__VIEWSTATEGENERATOR,
        __EVENTVALIDATION: data.__EVENTVALIDATION,
        ctl00_mainContent_ddlCampuses: data.ctl00_mainContent_ddlCampuses,
      });
      handleStudentCount();
    })();
  }, []);

  const refresh = async () => {
    localStorage.removeItem(subject);
    window.location.reload();
  };

  const crawlAndSave = async () => {
    // Check cached or not
    if (
      Date.now() < Number(localStorage.getItem("expireAt")) &&
      timeTableData
    ) {
      let lecturerList: any = [];
      slots.forEach((slot: any) => {
        weekdays.forEach((day: any) => {
          timeTable
            .get(day)
            ?.get(slot)
            ?.forEach((item: any) => {
              if (!lecturerList.includes(item.split("(")[1].replace(")", ""))) {
                lecturerList.push(item.split("(")[1].replace(")", ""));
              }
            });
        });
      });
      setLecturerList(lecturerList);
      return;
    }

    // Parse classes
    const data: string =
      document.querySelector("#ctl00_mainContent_dllCourse")?.innerHTML || "";
    const $ = cheerio.load(data);
    const classes = new Map<string, string>();
    classes.set(
      id,
      document.getElementById("ctl00_mainContent_lblOldGroup")?.innerText || ""
    );
    $("option").each((_i, e) => {
      const value = $(e).attr("value");
      if (value) {
        secondId = value;
        classes.set(value, $(e).text());
      }
    });
    setTotal(classes.size);

    // Fetch classes's time table
    console.time("Execution Time"); // Start timer
    const secondFormData = await secondFormGetter(secondId, id);
    for (const [key, _item] of classes) {
      formData.set("ctl00$mainContent$dllCourse", key);
      let nextClass;
      if (key == id) {
        nextClass = await (
          await fetch(baseUrl + `?id=${secondId}`, {
            method: "POST",
            headers: {},
            body: secondFormData,
          })
        ).text();
      } else {
        nextClass = await (
          await fetch(window.location.href, {
            method: "POST",
            headers: {},
            body: formData,
          })
        ).text();
      }
      const $$ = cheerio.load(nextClass);
      const classInfo = $$("#ctl00_mainContent_lblNewSlot").text();
      const className = $$(
        "#ctl00_mainContent_dllCourse > option:selected"
      ).text();
      const classDetail = classInfo.split(",");
      const lecture = classDetail[0].slice(
        classDetail[0].indexOf("Lecture:") + 9
      );
      for (const detail of classDetail) {
        const weekday = detail.slice(0, 3);
        const slot = detail.slice(11, 12);

        if (weekdays.indexOf(weekday) >= 0) {
          const updatedClassData = new Map(classData); // Create a new map object
          const slotMap =
            updatedClassData.get(weekday) || new Map<string, string[]>();
          const classNames = slotMap.get(slot) || [];
          classNames.push(
            className + ` (${lecture.length > 0 ? lecture : "N/A"})`
          );
          slotMap.set(slot, classNames);
          updatedClassData.set(weekday, slotMap);
          setTimeTable(updatedClassData);
        }
      }
      setGotten((prev) => prev + 1);
    }

    console.timeEnd("Execution Time");
    localStorage.setItem(subject, JSON.stringify(mapToObject(timeTable)));
    let lecturerListTemp: any = [];
    slots.forEach((slot: any) => {
      weekdays.forEach((day: any) => {
        timeTable
          .get(day)
          ?.get(slot)
          ?.forEach((item: any) => {
            if (
              !lecturerListTemp.includes(item.split("(")[1].replace(")", ""))
            ) {
              lecturerListTemp.push(item.split("(")[1].replace(")", ""));
            }
          });
      });
    });
    setLecturerList(lecturerListTemp);
    localStorage.setItem("expireAt", (Date.now() + 1000 * 60 * 60).toString());
  };

  return (
    <div className="w-full">
      <div className="my-8">
        <div className="flex gap-6 items-center mb-3">
          {!isLoading.fetching && (
            <span
              onClick={refresh}
              className="font-bold px-4 py-2 text-white text-3xl rounded-md bg-green-500 cursor-pointer flex gap-8"
            >
              Làm mới
            </span>
          )}

          {(isLoading.moving || isLoading.fetching) && (
            <>
              <div className="text-2xl">
                {isLoading.moving
                  ? "Đang thực hiện chuyển đổi, vui lòng đợi trong giây lát"
                  : "Đang lấy sĩ số lớp"}
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-rotate-cw rotate"
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </>
          )}
        </div>
        <select
          name=""
          id=""
          defaultValue={""}
          className="text-2xl border-2 rounded-md p-2 mt-2"
          onChange={async (e) => {
            setIsLoading((prev: any) => ({
              ...prev,
              moving: true,
            }));
            if (e.target.value) {
              send(e.target.value, changeSubjectForm);
            }
          }}
        >
          <option value="" disabled>
            Tìm theo môn học
          </option>
          {moveList?.map((move: any) => (
            <option
              selected={subject.includes(move.subject)}
              value={move?.moveId.replaceAll("_", "$")}
            >{`${move?.subject} - ${move?.classId} - ${
              move?.lecturer ?? "N/A"
            }`}</option>
          ))}
        </select>
        <select
          name=""
          id=""
          className="ml-4 text-2xl border-2 rounded-md p-2 mt-2"
          onChange={(e) =>
            setFilter((prev: any) => ({
              ...prev,
              lecturer: e.target.value,
            }))
          }
          defaultValue={""}
        >
          <option value="" disabled>
            Tìm theo giáo viên
          </option>
          <option value="">Tất cả</option>
          {lecturerList?.map((lecture: any) => (
            <option value={lecture}>{lecture}</option>
          ))}
        </select>
        {gotten < total && (
          <span className="my-4 flex gap-4 justify-between items-center w-full">
            <span className="text-2xl rotate">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-rotate-cw"
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </span>
            <progress value={gotten} max={total} className="w-full" />
          </span>
        )}
      </div>
      <table className="w-full">
        <thead>
          <tr className="">
            <td></td>
            {weekdays.map((day) => (
              <td className="text-white bg-blue-500 font-bold border p-2 w-[200px] text-center">
                {day}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot: any) => (
            <tr className="">
              <td className="text-white bg-blue-500 font-bold border w-[80px] text-center py-2 m-auto">
                Slot {slot}
              </td>
              {weekdays.map((day) => (
                <td
                  className="border col-span-1 p-2 w-[200px]"
                  onClick={() => {}}
                >
                  {timeTable
                    ?.get(day)
                    ?.get(slot)
                    ?.map((item: string) => {
                      return (
                        <div
                          className={`border-[0.5px] border-black font-bold p-2 rounded-md mb-2 bg-opacity-10 cursor-pointer hover:scale-[1.03] duration-200 ${
                            item.includes(filter.lecturer) ? "" : "hidden"
                          }`}
                          style={{
                            backgroundColor: textToColor(item),
                            // color: "black",
                          }}
                          onClick={async () => {
                            console.log(item);
                            const userConfirmed = window.confirm(
                              `Bạn có chắc muốn chuyển qua lớp ${item} không?`
                            );
                            if (userConfirmed) {
                              controller.abort();
                              setIsLoading((prev: any) => ({
                                ...prev,
                                moving: true,
                              }));

                              const classId = getClassKey().get(
                                item.split(" ")[0]
                              );
                              formData.set(
                                "ctl00$mainContent$dllCourse",
                                classId
                              );
                              formData.set("ctl00$mainContent$btSave", "Save");
                              const res = await fetch(window.location.href, {
                                method: "POST",
                                headers: {},
                                body: formData,
                              })
                                .then((res) => res.text())
                                .then((text) => {
                                  const alertTextRegex = /alert\('([^']*)'\)/;
                                  const match = text.match(alertTextRegex);
                                  return match?.[1];
                                });
                              if (res) {
                                alert(res);
                                if (res?.includes("đã được chấp nhận")) {
                                  const url = new URL(window.location.href);
                                  url.searchParams.set("id", classId);
                                  window.location.href = url.toString();
                                }
                              } else {
                                alert("Bạn đã ở trong lớp này rồi");
                              }
                              setIsLoading((prev: any) => ({
                                ...prev,
                                moving: false,
                              }));
                            }
                          }}
                        >
                          {item}
                          <br />
                          <span className="text-lg mt-1">
                            {`${studentCount?.[item.split(" ")[0]] ?? ""} ${
                              studentCount?.[item.split(" ")[0]]
                                ? "students"
                                : ""
                            }`}
                          </span>
                        </div>
                      );
                    })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <details className="p-4 [&_svg]:open:-rotate-180 mt-4">
          <summary className="flex cursor-pointer list-none items-center gap-4 text-3xl">
            <div>
              <svg
                className="rotate-0 transform text-blue-700 transition-all duration-300"
                fill="none"
                height={20}
                width={20}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <div>Danh sách lớp</div>
          </summary>
          <div className="h-[500px] overflow-y-scroll" id="class-list"></div>
        </details>
        <details className="p-4 [&_svg]:open:-rotate-180">
          <summary className="flex cursor-pointer list-none items-center gap-4 text-3xl">
            <div>
              <svg
                className="rotate-0 transform text-blue-700 transition-all duration-300"
                fill="none"
                height={20}
                width={20}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <div>Thời khóa biểu</div>
          </summary>
          <iframe
            src="https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx"
            className="w-full h-[500px] border"

            // style="border: 0px none; margin-left: -36px; height: 812px; margin-top: -486px; width: 650px;">
          ></iframe>
        </details>
      </div>
    </div>
  );
}
