import ExcelJS from 'exceljs';import JSZip from 'jszip';import fs from 'node:fs';import assert from 'node:assert/strict';
for(const name of ['product_mapping_template.xlsx','sales_template.xlsx']){
 const zip=await JSZip.loadAsync(fs.readFileSync('outputs/sprint3-4-templates/'+name));
 for(const [path,file] of Object.entries(zip.files))if(path.endsWith('.xml')){
  let xml=await file.async('string');
  // ExcelJS requires the standard default SpreadsheetML namespace.
  const ns=xml.match(/xmlns:(\w+)="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/);
  if(ns){const prefix=ns[1];xml=xml.replace(new RegExp('(<\\/?)(?:'+prefix+'):','g'),'$1').replace(ns[0],'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');zip.file(path,xml);}
 }
 const buf=await zip.generateAsync({type:'nodebuffer'});fs.writeFileSync('public/templates/'+name,buf);fs.writeFileSync('outputs/sprint3-4-templates/'+name,buf);
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(buf);assert.equal(wb.worksheets.length,2);assert.equal(wb.getWorksheet('Данные').rowCount,2);
 if(name.startsWith('product')){assert.equal(wb.getWorksheet('Данные').getCell('H1').value,'Кг в единице SKU');assert.equal(wb.getWorksheet('Данные').getCell('H2').value,180);}
 assert.ok(wb.getWorksheet('Описание').getCell(name.startsWith('product')?'E9':'E8').text.length>50);console.log(name+' PASS');
}

