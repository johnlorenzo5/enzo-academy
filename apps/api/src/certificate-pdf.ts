import { readFile } from 'node:fs/promises';
import { PDFDocument, rgb, PDFName, PDFString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';

export type CertificateContent = {id:string;holderName:string;moduleTitle:string;courseTitle:string;completedAt:string;issuedAt:string;verificationUrl:string;platformName:string};
const fontBytes=readFile(new URL('../assets/NotoSans-Regular.ttf',import.meta.url));
export async function certificatePdf(c:CertificateContent) {
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const font=await pdf.embedFont(await fontBytes,{subset:true});
  const page=pdf.addPage([842,595]);
  const ink=rgb(.08,.17,.14),green=rgb(.13,.4,.29),gold=rgb(.85,.69,.25);
  page.drawRectangle({x:0,y:0,width:842,height:595,color:rgb(.98,.98,.95)});
  page.drawRectangle({x:24,y:24,width:794,height:547,borderColor:green,borderWidth:2});
  page.drawRectangle({x:32,y:32,width:778,height:531,borderColor:gold,borderWidth:1});
  const line=(value:string,y:number,size:number,max=700,color=ink)=>{
    // Wrap long titles/names without truncating the certificate's identity fields.
    const chars=Array.from(value.replace(/[\r\n\t]/g,' '));let rows:string[]=[],row='';
    for(const char of chars){if(font.widthOfTextAtSize(row+char,size)>max){rows.push(row);row='';}row+=char;}rows.push(row);
    rows.forEach((text,i)=>page.drawText(text,{x:(842-font.widthOfTextAtSize(text,size))/2,y:y-i*(size+5),size,font,color}));
  };
  // Reuse the app's E + rising-arrow brand mark as a vector logo.
  page.drawRectangle({x:62,y:497,width:42,height:42,color:green});
  page.drawText('E',{x:72,y:507,size:24,font,color:rgb(1,1,1)});
  page.drawLine({start:{x:93,y:520},end:{x:100,y:531},thickness:2,color:gold});
  page.drawLine({start:{x:94,y:531},end:{x:100,y:531},thickness:2,color:gold});
  page.drawText(c.platformName,{x:116,y:512,size:18,font,color:green});
  line('CERTIFICATE OF COMPLETION',443,27);
  line('Presented to',401,12);
  line(c.holderName,369,26,700,green);
  line('For successfully completing all required learning and assessments in',291,11);
  line(c.moduleTitle,263,21,700);
  line(c.courseTitle,194,12);
  page.drawLine({start:{x:65,y:167},end:{x:777,y:167},thickness:1,color:gold});
  page.drawText(`Completed: ${c.completedAt.slice(0,10)}`,{x:65,y:142,size:11,font,color:ink});
  page.drawText(`Issued: ${c.issuedAt.slice(0,10)}`,{x:65,y:123,size:10,font,color:ink});
  page.drawText(c.id,{x:65,y:101,size:8,font,color:ink});
  page.drawText('Verify this certificate online',{x:65,y:77,size:10,font,color:green});
  const annotation=pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[62,70,300,94],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(c.verificationUrl)}}));
  page.node.set(PDFName.of('Annots'),pdf.context.obj([annotation]));
  const qr=await pdf.embedPng(await QRCode.toBuffer(c.verificationUrl,{width:180,margin:1}));
  page.drawImage(qr,{x:679,y:65,width:94,height:94});
  pdf.setTitle(`Certificate of Completion - ${c.moduleTitle}`);pdf.setAuthor(c.platformName);
  pdf.setCreationDate(new Date(c.issuedAt));
  return Buffer.from(await pdf.save());
}
