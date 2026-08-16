import {
  createProject,
  listProjects,
  listStatuses,
  createTask,
  createBoard,
  listBoards,
  updateTask,
} from "./localDb";
import type { Project } from "./types";

export async function seedDevData(): Promise<void> {
  const projects = await listProjects();
  if (projects.length > 0) return;

  await seedProject(
    "Веб-сайт компании",
    "Редизайн корпоративного сайта",
    [
      {
        status: 0,
        titles: [
          "Создать лендинг",
          "Подобрать шрифты",
          "Написать текст для hero-секции",
        ],
      },
      { status: 1, titles: ["Интеграция с CMS", "Адаптивная вёрстка"] },
      { status: 2, titles: ["Установка аналитики", "Покупка домена"] },
    ],
    ["Дизайн", "Бэкенд"],
  );

  await seedProject(
    "Мобильное приложение",
    "Трекер задач для iOS и Android",
    [
      {
        status: 0,
        titles: ["Экран онбординга", "Push-уведомления", "Тёмная тема"],
      },
      {
        status: 1,
        titles: ["Авторизация через OAuth", "Синхронизация с сервером"],
      },
      { status: 2, titles: ["Базовый CRUD задач", "Навигация по табам"] },
    ],
    ["iOS", "Android", "Backend"],
  );

  await seedProject(
    "Маркетинг Q3",
    "Кампании на третий квартал",
    [
      { status: 0, titles: ["A/B тест лендинга", "Настроить ретаргетинг"] },
      { status: 1, titles: ["Email-рассылка", "Контент-план блога"] },
      {
        status: 2,
        titles: ["Запуск Reddit-кампании", "Обновление презентации"],
      },
    ],
    ["Email", "Social"],
  );
}

interface SeedTasks {
  status: number;
  titles: string[];
}

async function seedProject(
  name: string,
  description: string,
  taskGroups: SeedTasks[],
  extraBoards?: string[],
): Promise<Project> {
  const project = await createProject(name, description);
  const statuses = await listStatuses(project.id);
  const boards = await listBoards(project.id);
  const defaultBoardId = boards[0]?.id;

  let taskCounter = 0;
  for (const group of taskGroups) {
    const status = statuses[group.status];
    if (!status) continue;
    for (const title of group.titles) {
      const task = await createTask(
        project.id,
        title,
        status.id,
        defaultBoardId,
      );
      if (taskCounter % 3 === 0) {
        await updateTask(project.id, task.id, { priority: 3 });
      } else if (taskCounter % 3 === 1) {
        await updateTask(project.id, task.id, { priority: 2 });
      }
      taskCounter++;
    }
  }

  if (extraBoards) {
    for (const boardName of extraBoards) {
      const existing = await listBoards(project.id);
      await createBoard(project.id, boardName, existing.length);
    }
  }

  return project;
}
