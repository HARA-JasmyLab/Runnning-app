import { generateText, Output, jsonSchema } from 'ai';

const MODEL = process.env.SILVA_MODEL || 'openai/gpt-5.6-luna';

const responseSchema = jsonSchema({
  type: 'object',
  additionalProperties: false,
  properties: {
    message: { type: 'string' },
    intent: {
      type: 'string',
      enum: ['collect_requirements','clarify','confirm','other']
    },
    tripDraft: {
      type: 'object',
      additionalProperties: false,
      properties: {
        destination: { type: ['string','null'] },
        startDate: { type: ['string','null'] },
        endDate: { type: ['string','null'] },
        party: { type: ['string','null'] },
        partySize: { type: ['number','null'] },
        interests: { type: 'array', items: { type: 'string' } },
        pace: { type: ['string','null'] },
        budget: { type: ['string','null'] },
        mustDo: { type: 'array', items: { type: 'string' } },
        notes: { type: 'array', items: { type: 'string' } }
      },
      required: ['destination','startDate','endDate','party','partySize','interests','pace','budget','mustDo','notes']
    },
    missingFields: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['destination','dates','party','interests','pace']
      }
    },
    suggestedReplies: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string' }
    },
    readyToGenerate: { type: 'boolean' }
  },
  required: ['message','intent','tripDraft','missingFields','suggestedReplies','readyToGenerate']
});

const SYSTEM = `
あなたは旅行アプリATTA!の旅の案内役「しるべ（Silva）」です。
あなたの役割は、ユーザーとの短い会話から旅行の希望を整理することです。

人格:
- 親しみやすいが、子どもっぽすぎない。
- 決めつけず「こんなのはどう？」という姿勢。
- 1回の返答は日本語で2〜4文程度。
- ユーザーが答えやすい質問を一度に1つだけする。
- 絵文字は原則使わない。画面側のキャラクター表現に任せる。

重要な制約:
- この段階では具体的な観光スポット、営業時間、料金、空席、混雑を事実として創作しない。
- まだPlace検索結果を受け取っていないため、詳細旅程を確定しない。
- ユーザーが明示した内容だけをtripDraftへ保存する。曖昧な内容を勝手に補完しない。
- 日付が相対表現の場合、無理にISO日付へ変換せずnotesへ残し、必要なら確認する。
- readyToGenerateは destination / dates / party / interests / pace が揃ったときのみtrue。
- すでに揃っている情報を繰り返し聞かない。
- 足りない条件のうち、旅行体験に最も影響するものを1つだけ質問する。
- 予算は任意。mustDoも任意。

出力は指定された構造のみ。
`;

function cleanMessages(input){
  if(!Array.isArray(input)) return [];
  return input
    .slice(-12)
    .filter(m=>m && (m.role==='user'||m.role==='assistant') && typeof m.content==='string')
    .map(m=>({role:m.role,content:m.content.slice(0,1200)}));
}

export default {
  async fetch(request) {
    if(request.method === 'GET'){
      return Response.json({
        ok:true,
        service:'silva',
        model:MODEL,
        mode:'trip-requirements'
      },{headers:{'Cache-Control':'no-store'}});
    }
    if(request.method !== 'POST'){
      return Response.json({error:'Method not allowed'},{status:405,headers:{Allow:'GET, POST'}});
    }

    try{
      const body=await request.json();
      const messages=cleanMessages(body.messages);
      const tripDraft=body.tripDraft && typeof body.tripDraft==='object' ? body.tripDraft : {};
      if(!messages.length){
        return Response.json({error:'messages are required'},{status:400});
      }

      const transcript=messages.map(m=>`${m.role==='user'?'ユーザー':'しるべ'}: ${m.content}`).join('\n');
      const prompt=`
現在の旅行希望:
${JSON.stringify(tripDraft,null,2)}

会話:
${transcript}

会話を踏まえてtripDraftを更新し、次にしるべが言う短い返答を作ってください。
`;

      const { output } = await generateText({
        model: MODEL,
        system: SYSTEM,
        prompt,
        output: Output.object({
          name: 'silva_trip_requirements',
          description: 'ATTA! trip requirement conversation state',
          schema: responseSchema
        }),
        maxOutputTokens: 1200
      });

      return Response.json(output,{
        headers:{
          'Cache-Control':'no-store',
          'Content-Type':'application/json; charset=utf-8'
        }
      });
    }catch(error){
      console.error('Silva API error',error);
      return Response.json({
        error:'しるべが少し迷っているようです。もう一度話しかけてください。'
      },{status:500});
    }
  }
};
