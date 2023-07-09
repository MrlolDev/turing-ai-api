import ChartJsImage from "chartjs-to-image";
import supabase from "../db/supabase.js";
import ms from "ms";

const availableCharts = [
  "chat",
  "guilds",
  "cooldown",
  "commands",
  "image",
  "vote",
  "campaigns",
  "midjourney",
  "datasets",
];
const availableTypes = ["line", "bar"];

export async function getChartImage(chart, filter, period, type) {
  if (!availableCharts.includes(chart)) throw new Error("Invalid chart");
  if (!availableTypes.includes(type)) throw new Error("Invalid type of chart");
  let chartImage = new ChartJsImage();
  let { data } = await supabase.from("metrics").select("*").eq("type", chart);
  console.log(data.length);
  data = data.filter((d: any) => {
    let date = new Date(d.time);
    let now = new Date();
    let diff = now.getTime() - date.getTime();
    let periodMs = ms(period);
    return diff <= periodMs;
  });
  console.log(data);
  //sort by data, old first , recent last
  data = data.sort((a: any, b: any) => {
    let dateA = new Date(a.time);
    let dateB = new Date(b.time);
    return dateA.getTime() - dateB.getTime();
  });

  let metricData = data.map((d: any) => d.data);
  if (metricData.length === 0) throw new Error("No data found");

  let data1 = metricData[0];
  console.log(data1);
  let keys = Object.keys(data1);
  let newKeys = [];
  let keysToRemove = [];
  for (let i = 0; i < keys.length; i++) {
    if (typeof data1[keys[i]] == "object") {
      // get all the keys of the object
      let subKeys = Object.keys(data1[keys[i]]);
      for (let j = 0; j < subKeys.length; j++) {
        // check subkeys for objects
        if (typeof data1[keys[i]][subKeys[j]] == "object") {
          let subSubKeys = Object.keys(data1[keys[i]][subKeys[j]]);
          // change subkeys to be parentKey-subKey-subSubKey
          subSubKeys = subSubKeys.map(
            (subSubKey) => `${keys[i]}.${subKeys[j]}.${subSubKey}`
          );
          // remove the parent key
          keysToRemove.push(`${keys[i]}.${subKeys[j]}`);
          // add the subkeys
          newKeys.push(...subSubKeys);
        }
      }
      // change subkeys to be parentKey-subKey
      subKeys = subKeys.map((subKey) => `${keys[i]}.${subKey}`);
      // remove the parent key
      keysToRemove.push(keys[i]);
      // add the subkeys
      newKeys.push(...subKeys);
    }
  }
  keys = keys.filter((key) => !keysToRemove.includes(key));
  keys.push(...newKeys);

  if (filter) {
    // filter is a object with include and exclude arrays
    if (filter.include) {
      keys = keys.filter((key) => filter.include.includes(key));
    }
    if (filter.exclude) {
      keys = keys.filter((key) => !filter.exclude.includes(key));
      // filter parent keys
      keys = keys.filter((key) => {
        if (key.includes(".")) {
          let parentKey = key.split(".")[0];
          return !filter.exclude.includes(parentKey);
        }
        return true;
      });
      // filter subkeys
      keys = keys.filter((key) => {
        if (key.includes(".")) {
          let parentKey = key.split(".")[0];
          let subKey = key.split(".")[1];
          return !filter.exclude.includes(`${parentKey}.${subKey}`);
        }
        return true;
      });
    }
  }

  let labels = [];
  let datasets = [];

  if (type != "pie" && type != "doughnut") {
    labels = data.map((d: any) => {
      let date = new Date(d.time);
      // format into dd/mm/yyyy hh:mm
      let day = date.getDate();
      let month = date.getMonth() + 1;
      let year = date.getFullYear();
      let hours = date.getHours();
      let minutes = date.getMinutes();
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    });

    keys.forEach((key) => {
      let dataset;
      dataset = {
        label: key,
        data: [],
        fill: false,
      };
      if (key.includes(".")) {
        let parentKey = key.split(".")[0];
        let subKey = key.split(".")[1];
        // check for subSubKey
        if (key.split(".").length == 3) {
          let subSubKey = key.split(".")[2];
          data.forEach((d: any) => {
            if (d.data[parentKey][subKey][subSubKey])
              dataset.data.push(d.data[parentKey][subKey][subSubKey]);
          });
        } else {
          data.forEach((d: any) => {
            if (d.data[parentKey][subKey])
              dataset.data.push(d.data[parentKey][subKey]);
          });
        }
      } else {
        data.forEach((d: any) => {
          if (d.data[key]) dataset.data.push(d.data[key]);
        });
      }

      datasets.push(dataset);
    });
  } else {
    labels = keys;
    // do pie chart
    datasets = [
      {
        label: "Data",
        data: [],
        backgroundColor: [],
      },
    ];
    let dataset = datasets[0];
    keys.forEach((key) => {
      if (key.includes(".")) {
        let parentKey = key.split(".")[0];
        let subKey = key.split(".")[1];
        // check for subSubKey
        if (key.split(".").length == 3) {
          let subSubKey = key.split(".")[2];
          data.forEach((d: any) => {
            if (d.data[parentKey][subKey][subSubKey])
              dataset.data.push(d.data[parentKey][subKey][subSubKey]);
          });
        } else {
          data.forEach((d: any) => {
            if (d.data[parentKey][subKey])
              dataset.data.push(d.data[parentKey][subKey]);
          });
        }
      } else {
        data.forEach((d: any) => {
          if (d.data[key]) dataset.data.push(d.data[key]);
        });
      }
      dataset.backgroundColor.push(
        `hsl(${Math.floor(Math.random() * 360)}, 100%, 50%)`
      );
    });
  }

  // if there more than 10 labels make the chart bigger
  let width = 1000;
  if (labels.length > 10) {
    let height = labels.length * 20;
    chartImage.setHeight(height);
  }
  chartImage.setConfig({
    type: type,
    data: {
      labels: labels,
      datasets: datasets,
    },
  });
  chartImage.setWidth(width);
  let base64 = await chartImage.toDataUrl();

  try {
    let shortUrl = await chartImage.getShortUrl();
    return { image: base64, shortUrl };
  } catch (error) {
    return { image: base64 };
  }
}

async function extractData(period, chart) {
  let { data, error } = await supabase
    .from("metrics")
    .select("*")
    .eq("type", chart);
  if (error) throw new Error(error.message);
  data = data.filter((d: any) => {
    let date = new Date(d.time);
    let now = new Date();
    let diff = now.getTime() - date.getTime();
    let periodMs = ms(period);
    return diff <= periodMs;
  });
  //sort by data, old first , recent last
  data = data.sort((a: any, b: any) => {
    let dateA = new Date(a.time);
    let dateB = new Date(b.time);
    return dateA.getTime() - dateB.getTime();
  });
  return data;
}
