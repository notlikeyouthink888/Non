csharp
using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace NarrativeSim.Core
{
    /// <summary>
    /// يتصل بـ OpenRouter API لتوليد حوارات ديناميكية uncensored للـ NPC.
    /// يأخذ مستوى الفساد من ProgressionSystem لتخصيص ردود الشخصية.
    /// </summary>
    public class DialogueAIManager : MonoBehaviour
    {
        [Header("API Settings")]
        [SerializeField] private string apiKey = "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";
        [SerializeField] private string apiUrl = "https://openrouter.ai/api/v1/chat/completions";
        // موديل Uncensored متاح على OpenRouter
        [SerializeField] private string modelId = "nousresearch/nous-hermes-llama2-13b"; 

        [Header("References")]
        [SerializeField] private ProgressionSystem progressionSystem;

        [Header("UI (Optional)")]
        [Tooltip("نص لعرض الحوار مؤقتاً إن ما عندك نظام UI كامل.")]
        [SerializeField] private UnityEngine.UI.Text dialogueDisplayText;

        // حدث يطلق عند وصول النص من الـ AI
        public event Action<string> OnDialogueGenerated;

        /// <summary>
        /// استدعِ هذه الدالة عند بدء التفاعل مع NPC لتوليد رد منه.
        /// </summary>
        /// <param name="playerName">اسم اللاعب (مثلاً: Mike)</param>
        /// <param name="npcName">اسم الشخصية</param>
        /// <param name="actionDescription">وصف ما يفعله مايك بها</param>
        public void RequestDialogue(string playerName, string npcName, string actionDescription)
        {
            StartCoroutine(SendRequest(playerName, npcName, actionDescription));
        }

        private IEnumerator SendRequest(string playerName, string npcName, string actionDescription)
        {
            float corruption = progressionSystem != null ? progressionSystem.GetStat(ProgressionSystem.Corruption) : 0f;

            // بناء الـ System Prompt بناءً على مستوى الفساد
            string systemPrompt = $`@"You are {npcName}, a character in an adult 3D game. 
The player {playerName} is interacting with you. 
Your current corruption level is {corruption}/100. 
If corruption is low, you might resist or be shy. 
If corruption is high, you are fully submissive and extremely aroused by humiliation and rough actions.
Respond only with {npcName}'s dialogue in Arabic. Do not include actions in brackets.";

            string userPrompt = `$"{playerName} does: {actionDescription}. How do you react?";

            // بناء الـ JSON Payload يدوياً لتجنب مشاكل التسلسل
            string jsonPayload = $`"{{\"model\": \"{modelId}\", \"messages\": [{{\"role\": \"system\", \"content\": \"{EscapeJson(systemPrompt)}\"}}, {{\"role\": \"user\", \"content\": \"{EscapeJson(userPrompt)}\"}}]}}";

            using (UnityWebRequest request = new UnityWebRequest(apiUrl, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonPayload);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Authorization", "Bearer " + apiKey);
                request.timeout = 30;

                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.ConnectionError || request.result == UnityWebRequest.Result.ProtocolError)
                {
                    Debug.LogError("AI Error: " + request.error);
                    string errorMsg = "...";
                    OnDialogueGenerated?.Invoke(errorMsg);
                    if (dialogueDisplayText != null) dialogueDisplayText.text = errorMsg;
                }
                else
                {
                    // استخراج النص من الـ JSON
                    string responseText = ExtractContentFromJson(request.downloadHandler.text);
                    Debug.Log(`$"{npcName} says: {responseText}");
                    OnDialogueGenerated?.Invoke(responseText);
                    if (dialogueDisplayText != null) dialogueDisplayText.text = responseText;
                }
            }
        }

        // دالة مساعدة لاستخراج محتوى الرسالة من JSON البسيط
        private string ExtractContentFromJson(string json)
        {
            // نبحث عن "content":"..." ونستخرج النص
            string marker = "\"content\":\"";
            int startIndex = json.IndexOf(marker);
            if (startIndex == -1) return "Error parsing AI response.";
            
            startIndex += marker.Length;
            int endIndex = json.IndexOf("\"", startIndex); // نبحث عن أول قوس إغلاق
            // قد يحتوي النص على أقواس م Escaped، لذا نبحث عن القوس الأخير قبل "index"
            int nextBracket = json.IndexOf("}", startIndex);
            
            // لتبسيط الأمر، نأخذ الجزء بين startIndex وأول "index" أو "finish_reason"
            int finishMarker = json.IndexOf("\"index\":", startIndex);
            if (finishMar
