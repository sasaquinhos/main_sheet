function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getRange(1, 1).getValue(); // A1セルにJSONを保存・取得する想定
  
  const response = {
    status: "success",
    data: data ? JSON.parse(data) : {}
  };
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  try {
    const postData = JSON.parse(e.postData.contents);
    sheet.getRange(1, 1).setValue(JSON.stringify(postData));
    
    const response = {
      status: "success",
      message: "Data saved successfully"
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    const response = {
      status: "error",
      message: error.toString()
    };
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
